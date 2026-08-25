import { getUser } from "#server/lib/auth";
import { prisma } from "#server/utils/prisma";

export default defineEventHandler(async event => {
  const user = await getUser(event);

  if (!user) {
    throw createError({
      statusCode: 401,
      message: "请先登录",
    });
  }

  const id = getRouterParam(event, "id");
  if (!id) {
    throw createError({
      statusCode: 400,
      message: "缺少文章 ID",
    });
  }
  const cid = Number(id);
  if (!Number.isInteger(cid) || cid <= 0) {
    throw createError({
      statusCode: 400,
      message: "文章 ID 不合法",
    });
  }

  try {
    const relations = await prisma.contentrelations.findMany({
      where: {
        cid,
        metas: {
          type: "tag",
        },
      },
      // 约定1 白名单：不裸返回整行 metas，只取必要字段
      include: {
        metas: {
          select: { mid: true, name: true, slug: true, desc: true },
        },
      },
    });

    return {
      success: true,
      data: relations.map(r => r.metas),
    };
  } catch (error) {
    // 已知 4xx 原样抛，不打印堆栈
    if (error instanceof Error && "statusCode" in error) {
      throw error;
    }
    console.error(error);
    throw createError({
      statusCode: 500,
      message: "获取文章标签失败",
    });
  }
});
