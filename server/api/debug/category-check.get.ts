import { prisma } from "#server/utils/prisma";

export default defineEventHandler(async event => {
  try {
    // 查询 slug 为 shotasdsa 的记录
    const category = await prisma.metas.findUnique({
      where: {
        slug: "shotasdsa",
      },
    });

    // 查询所有 type 为 category 但可能应该是标签的记录
    const allCategories = await prisma.metas.findMany({
      where: {
        type: "category",
      },
      select: {
        mid: true,
        name: true,
        slug: true,
        type: true,
      },
    });

    // 查询所有 type 为 tag 的记录
    const allTags = await prisma.metas.findMany({
      where: {
        type: "category",
        type: "tag",
      },
      select: {
        mid: true,
        name: true,
        slug: true,
        type: true,
      },
    });

    return {
      target: category,
      allCategories,
      allTags,
    };
  } catch (error) {
    console.error("查询失败:", error);
    return {
      error: error.message,
    };
  }
});
