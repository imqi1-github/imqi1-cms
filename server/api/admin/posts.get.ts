import prisma from "#server/utils/prisma";

export default defineEventHandler(async () => {
  try {
    const posts = await prisma.post.findMany({
      orderBy: { create_time: "desc" },
    });
    return posts;
  } catch (error) {
    throw createError({
      statusCode: 500,
      message: "获取文章列表失败",
    });
  }
});
