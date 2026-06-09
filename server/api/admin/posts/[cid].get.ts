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

  const cid = Number(getRouterParam(event, 'cid'));

  if (!cid) {
    throw createError({
      statusCode: 400,
      message: "文章 ID 不能为空",
    });
  }

  const post = await prisma.posts.findUnique({
    where: { cid },
    include: {
      user: {
        select: {
          uid: true,
          name: true,
          avatar: true,
        },
      },
    },
  });

  if (!post) {
    throw createError({
      statusCode: 404,
      message: "文章不存在",
    });
  }

  return {
    success: true,
    data: post,
  };
});
