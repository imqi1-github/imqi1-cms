import { prisma, isPrismaNotFoundError } from "#server/utils/prisma";
import { computeLikeFingerprint } from "#server/utils/likes";
import type { LikeStateResponse } from "#server/types/apis/content/likes";

/**
 * GET /api/contents/likes/:cid —— 取文章点赞状态（公开读）。
 *
 * 校验文章存在且 status=1 + type=0，否则 404（避免访客给草稿点赞而草稿/分类页面看不到点赞数）；
 * 同时校验文章必须存在一条匹配 cid 的 likes 复合索引，否则 likes.count 是 0；
 * liked 字段由访客指纹 vs likes.fingerprint 决定（前端 localStorage 是二次保险）。
 */
export default defineEventHandler(async event => {
  const cidParam = getRouterParam(event, "cid");
  const cid = Number(cidParam);

  if (!Number.isInteger(cid) || cid <= 0) {
    throw createError({ statusCode: 400, message: "文章 ID 非法" });
  }

  try {
    // 文章存在性 + 状态校验：likes 复合索引要求 cid 必须是 type=0, status=1 的文章
    const contentExists = await prisma.contents.findFirst({
      where: { cid, status: 1, type: 0 },
      select: { cid: true },
    });

    if (!contentExists) {
      throw createError({ statusCode: 404, message: "文章不存在" });
    }

    const fingerprint = computeLikeFingerprint(event);

    // count + liked 并行：count 走 groupBy 取一条；liked 走单条 exists
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

    const payload: LikeStateResponse = {
      success: true,
      data: {
        cid,
        count: countResult._count._all,
        liked: Boolean(likedRow),
      },
    };

    return payload;
  } catch (error) {
    if (error instanceof Error && "statusCode" in error) throw error;
    if (isPrismaNotFoundError(error)) {
      throw createError({ statusCode: 404, message: "文章不存在" });
    }
    console.error(error);
    throw createError({ statusCode: 500, message: "获取点赞状态失败" });
  }
});