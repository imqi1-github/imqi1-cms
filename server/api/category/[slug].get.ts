import { prisma } from "#server/utils/prisma";

export default defineEventHandler(async event => {
  const categorySlug = getRouterParam(event, 'slug');

  if (!categorySlug) {
    throw createError({
      statusCode: 400,
      message: "分类 slug 不能为空",
    });
  }

  // uncategorized 是虚拟兜底分类，用于容错数据不完整的文章
  if (categorySlug === "uncategorized") {
    return {
      success: true,
      data: {
        mid: 0,
        name: "未分类",
        slug: "uncategorized",
        desc: null,
      },
    };
  }

  // 获取分类信息
  const category = await prisma.metas.findUnique({
    where: {
      slug: categorySlug,
      type: 'category', // 确保只返回分类类型
    },
    select: {
      mid: true,
      name: true,
      slug: true,
      desc: true,
    },
  });

  if (!category) {
    throw createError({
      statusCode: 404,
      message: "分类不存在",
    });
  }

  return {
    success: true,
    data: category,
  };
});
