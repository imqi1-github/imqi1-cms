import { prisma } from "#server/utils/prisma";

export default defineEventHandler(async () => {
  try {
    // 四个独立 count 并行查询（互不依赖，避免串行叠加延迟）
    const [publishedContentsNum, publishedCommentsNum, categoriesNum, tagsNum] = await Promise.all([
      prisma.contents.count({ where: { type: 0, status: 1 } }), // 已发布文章
      prisma.comments.count({ where: { status: 1 } }), // 已审核评论
      prisma.metas.count({ where: { type: "category" } }), // 分类数
      prisma.metas.count({ where: { type: "tag" } }), // 标签数
    ]);

    return {
      success: true,
      data: {
        publishedContentsNum,
        publishedCommentsNum,
        categoriesNum,
        tagsNum,
      },
    };
  } catch (error) {
    console.error(error);
    throw createError({
      statusCode: 500,
      message: "获取站点统计失败",
    });
  }
});
