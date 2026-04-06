import { prisma } from "#server/utils/prisma";

export default defineEventHandler(async event => {
  try {
    // 获取已发布的文章数
    const publishedPostsNum = await prisma.post.count({
      where: {
        type: 0, // 文章
        status: 1, // 已发布
      },
    });

    // 获取已审核的评论数
    const publishedCommentsNum = await prisma.comment.count({
      where: {
        status: 1, // 已审核
      },
    });

    // 获取分类数
    const categoriesNum = await prisma.category.count({
      where: {
        type: "category",
      },
    });

    // 获取标签数
    const tagsNum = await prisma.category.count({
      where: {
        type: "tag",
      },
    });

    return {
      success: true,
      data: {
        publishedPostsNum,
        publishedCommentsNum,
        categoriesNum,
        tagsNum,
      },
    };
  } catch (error) {
    console.error("获取站点统计失败:", error);
    throw createError({
      statusCode: 500,
      message: "获取站点统计失败",
    });
  }
});
