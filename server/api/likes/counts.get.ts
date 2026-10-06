/**
 * GET /api/likes/counts —— 批量查多篇文章的点赞数（公开读）。
 *
 * 设计：
 *  - 入参 ?cids=1,2,3（逗号分隔正整数）
 *  - 单次 prisma.groupBy + by='cid' + _count：一次 DB 调用，O(N) 出结果。
 *  - 返回 { success: true, data: { 1: 5, 2: 3, ... } }：扁平 map 便于前端 .map().likesCount 直接查。
 *  - 不在请求的 cid 返回 0（map 没 key 即 ?? 0）。
 *
 * 为何独立接口：列表页（首页/分类/标签）拿 article 数据已有自己的 API（comment_num 等字段），
 * 不破坏既有接口契约，单加 likesCount 字段会让旧 fixture / 前端期望变化。
 * 单独批量接口让前端只在用得到点赞数的页面发起，无感接入。
 *
 * 缓存：默认 5 分钟 CDN/浏览器（与 PUBLIC_CACHE_CONTROL 一致）。点赞 POST 后失效此路由即可。
 */
import { prisma } from "#server/utils/prisma";
import { PUBLIC_CACHE_CONTROL } from "#shared/constants";

export default defineEventHandler(async event => {
  try {
    const q = getQuery(event);
    const raw = typeof q.cids === "string" ? q.cids : "";
    // 严格正整数白名单：避免 ?cids=foo,1;2 这种 injection / 边界
    const cids = Array.from(
      new Set(
        raw
          .split(",")
          .map(s => Number(s))
          .filter(n => Number.isInteger(n) && n > 0 && n < 2_000_000_000),
      ),
    );

    // 单次 groupBy by cid + _count：一次 SQL 出 N 行
    // 不传 cids 时返全表所有有赞文章的计数（页面 SSR 阶段列表数据尚未就绪，
    // 走「全量查」让 SSR 一定能拿到结果，hydrate 后按 cid 取；全表规模下查询走 cid 索引 O(N)）
    const rows = await prisma.likes.groupBy({
      by: ["cid"],
      ...(cids.length > 0 ? { where: { cid: { in: cids } } } : {}),
      _count: { _all: true },
    });

    const data: Record<string, number> = {};
    // 不传 cids：只返非零项；传 cids：所有 cid 都返（0 也带出，便于前端 ?? 默认）
    if (cids.length > 0) for (const cid of cids) data[String(cid)] = 0;
    for (const r of rows) data[String(r.cid)] = r._count._all;

    setHeader(event, "Cache-Control", PUBLIC_CACHE_CONTROL);
    return { success: true, data };
  } catch (error) {
    console.error("[likes/counts] 批量查点赞数失败:", error);
    throw createError({ statusCode: 500, message: "查询点赞数失败" });
  }
});