import { prisma, isPrismaNotFoundError, isPrismaUniqueConstraintError } from "#server/utils/prisma";
import { computeLikeFingerprint, isLikeRateLimited } from "#server/utils/likes";
import { getClientIp } from "#server/utils/client-ip";
import { invalidateContentCaches } from "#server/utils/content-cache";
import { log } from "#server/utils/log";
import type { LikeToggleResponse } from "#server/types/apis/content/likes";

/**
 * POST /api/contents/likes/:cid —— 点赞（公开写，幂等）。
 *
 * 安全：
 *  - 不要求登录，无 CSRF；公开访问 POST 但行为幂等（重复点不会重复计数）。
 *  - 限速：Redis 5 分钟/指纹/文章，未配 Redis 时依赖复合唯一约束兜底。
 *  - 唯一约束 (cid, fingerprint) 防并发竞态写穿。
 *  - 行为：第一次点击创建；后续命中已存在行返回 created=false，count/liked 不变。
 *
 * 公开字段白名单：响应只下发 cid/count/liked/created，ip/user_agent 永不返回。
 */
export default defineEventHandler(async event => {
  const cidParam = getRouterParam(event, "cid");
  const cid = Number(cidParam);

  if (!Number.isInteger(cid) || cid <= 0) {
    throw createError({ statusCode: 400, message: "文章 ID 非法" });
  }

  // 与 fingerprint 同源（吃 TRUSTED_PROXY），否则反代下落库成网关 IP，审计无从反查
  const ip = getClientIp(event);
  const ua = (event.node.req.headers["user-agent"] || "").toString().slice(0, 255) || null;
  const fingerprint = computeLikeFingerprint(event);

  try {
    // 文章存在性 + 状态校验：与 GET 保持一致口径
    const contentExists = await prisma.contents.findFirst({
      where: { cid, status: 1, type: 0 },
      select: { cid: true },
    });

    if (!contentExists) {
      throw createError({ statusCode: 404, message: "文章不存在" });
    }

    // Redis 限速：5 分钟内同一访客对同一文章的重复 POST 视作幂等命中，直接读 count
    if (await isLikeRateLimited(cid, fingerprint)) {
      const [countResult, likedRow] = await Promise.all([
        prisma.likes.aggregate({
          where: { cid },
          _count: { _all: true },
        }),
        prisma.likes.findFirst({
          where: { cid, fingerprint },
          select: { id: true },
        }),
      ]);
      const payload: LikeToggleResponse = {
        success: true,
        data: {
          cid,
          count: countResult._count._all,
          liked: Boolean(likedRow),
          created: false,
        },
      };
      return payload;
    }

    // 写库：复合唯一约束 (cid, fingerprint) 兜底并发竞态 —— P2002 视为幂等命中
    try {
      await prisma.likes.create({
        data: {
          cid,
          fingerprint,
          ip,
          user_agent: ua,
        },
      });
    } catch (error) {
      if (
        isPrismaUniqueConstraintError(error)
      ) {
        // 唯一约束命中 = 已点过；按 created=false 处理，不抛错
        const countResult = await prisma.likes.aggregate({
          where: { cid },
          _count: { _all: true },
        });
        const payload: LikeToggleResponse = {
          success: true,
          data: {
            cid,
            count: countResult._count._all,
            liked: true,
            created: false,
          },
        };
        return payload;
      }
      throw error;
    }

    // 新创建成功：返回最新 count
    const countResult = await prisma.likes.aggregate({
      where: { cid },
      _count: { _all: true },
    });

    const payload: LikeToggleResponse = {
      success: true,
      data: {
        cid,
        count: countResult._count._all,
        liked: true,
        created: true,
      },
    };

    // 点赞数变更 ISR 失效：列表页（首页/归档/分类/标签）和文章详情页都显示点赞数，全部失效。
    // 失效路由集合 = HOME + ARCHIVING + CATEGORY + TAG + CONTENT_DETAIL + likes/counts 批量接口。
    // 点赞频率远低于阅读频率，cache thrashing 影响可控。
    void invalidateContentCaches({
      routes: ["/", "/archiving", "/category/**", "/tag/**", "/content/**", "/api/likes/counts"],
    }).catch(err => log.external("cache.invalidate.error", { scope: "likes", err: String(err) }));

    return payload;
  } catch (error) {
    if (error instanceof Error && "statusCode" in error) throw error;
    if (isPrismaNotFoundError(error)) {
      throw createError({ statusCode: 404, message: "文章不存在" });
    }
    console.error(error);
    throw createError({ statusCode: 500, message: "点赞失败" });
  }
});