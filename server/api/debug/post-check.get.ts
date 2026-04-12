import { prisma } from "#server/utils/prisma";

export default defineEventHandler(async event => {
  try {
    // 查询所有关联了 shotasdsa (mid=6) 的文章
    const postRelations = await prisma.postrelation.findMany({
      where: {
        mid: 6, // shotasdsa 的 mid
      },
      include: {
        post: {
          select: {
            cid: true,
            title: true,
            slug: true,
          },
        },
        category: {
          select: {
            mid: true,
            name: true,
            slug: true,
            type: true,
          },
        },
      },
    });

    // 查找一篇文章示例，看它的所有关联
    const examplePostRelations = await prisma.postrelation.findMany({
      where: {
        cid: postRelations[0]?.cid,
      },
      include: {
        category: {
          select: {
            mid: true,
            name: true,
            slug: true,
            type: true,
          },
        },
      },
      orderBy: {
        mid: "asc",
      },
    });

    return {
      postRelations,
      examplePostRelations,
    };
  } catch (error) {
    console.error("查询失败:", error);
    return {
      error: error.message,
      details: error,
    };
  }
});
