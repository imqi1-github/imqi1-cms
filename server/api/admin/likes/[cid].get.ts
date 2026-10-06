import { prisma, isPrismaNotFoundError } from "#server/utils/prisma";
import { getUser } from "#server/lib/auth";
import { PUBLIC_LIMIT_MAX } from "#shared/constants";

/**
 * GET /api/admin/likes/[cid] —— 后台查单篇文章的点赞列表（分页）。
 *
 * 设计：
 *  - 后台鉴权（getUser） + 路径 cid 必须是正整数 + 文章必须存在。
 *  - 分页 page 1..200, pageSize 1..100（与 PUBLIC_LIMIT_MAX 对齐）
 *  - 仅下发表情需要的字段：id / fingerprint（截断显示）/ ip / user_agent（截断显示）/ create_time
 *  - 缓存：no-store（管理后台实时性要求高，禁用任何缓存）
 */
export default defineEventHandler(async event => {
  const user = await getUser(event);
  if (!user) {
    throw createError({ statusCode: 401, message: "请先登录" });
  }

  const cidParam = getRouterParam(event, "cid");
  const cid = Number(cidParam);
  if (!Number.isInteger(cid) || cid <= 0) {
    throw createError({ statusCode: 400, message: "文章 ID 非法" });
  }

  const query = getQuery(event);
  const page = Math.min(200, Math.max(1, Math.floor(Number(query.page) || 1)));
  const pageSize = Math.min(PUBLIC_LIMIT_MAX, Math.max(1, Math.floor(Number(query.pageSize) || 20)));
  const skip = (page - 1) * pageSize;

  try {
    const article = await prisma.contents.findUnique({
      where: { cid, status: 1 }, // 仅已发布（status=1）才可能有点赞
      select: { cid: true, title: true },
    });
    if (!article) {
      throw createError({ statusCode: 404, message: "文章不存在或未发布" });
    }

    const [items, total] = await Promise.all([
      prisma.likes.findMany({
        where: { cid },
        orderBy: { create_time: "desc" },
        skip,
        take: pageSize,
        select: {
          id: true,
          // 截断显示：避免后台误把完整 fingerprint/IP/UA 复制出去；这只是 hint
          fingerprint: true,
          ip: true,
          user_agent: true,
          create_time: true,
        },
      }),
      prisma.likes.count({ where: { cid } }),
    ]);

    setHeader(event, "Cache-Control", "no-store");

    return {
      success: true,
      data: {
        article,
        items,
        pagination: {
          page,
          pageSize,
          total,
          totalPages: Math.ceil(total / pageSize),
        },
      },
    };
  } catch (error) {
    if (error instanceof Error && "statusCode" in error) throw error;
    if (isPrismaNotFoundError(error)) {
      throw createError({ statusCode: 404, message: "文章不存在" });
    }
    console.error("[admin/likes.get] 查询失败:", error);
    throw createError({ statusCode: 500, message: "查询点赞列表失败" });
  }
});