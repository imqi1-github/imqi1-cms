import { prisma } from "#server/utils/prisma";

export default defineEventHandler(async event => {
  const cid = Number(getRouterParam(event, 'cid'));

  if (!cid) {
    throw createError({
      statusCode: 400,
      message: "文章 ID 不能为空",
    });
  }

  const post = await prisma.post.findUnique({
    where: { cid },
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
