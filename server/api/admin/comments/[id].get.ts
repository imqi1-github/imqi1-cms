import { prisma } from "#server/utils/prisma";
import { getUser } from "#server/lib/auth";

export default defineEventHandler(async event => {
  // 验证用户登录
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
      message: "缺少评论 ID",
    });
  }

  try {
    const comment = await prisma.comments.findUnique({
      where: { coid: Number(id) },
      select: {
        coid: true,
        cid: true,
        name: true,
        mail: true,
        link: true,
        content: true,
        create_time: true,
        status: true,
        parent_id: true,
        agent: true,
        ip: true,
        posts: {
          select: {
            cid: true,
            title: true,
          },
        },
      },
    });

    if (!comment) {
      throw createError({
        statusCode: 404,
        message: "评论不存在",
      });
    }

    return {
      success: true,
      data: comment,
    };
  } catch (error) {
    console.error("获取评论失败:", error);
    throw createError({
      statusCode: 500,
      message: "获取评论失败",
    });
  }
});
