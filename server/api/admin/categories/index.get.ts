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

  try {
    // 获取所有分类（type = 'category'）
    const categories = await prisma.meta.findMany({
      where: {
        type: "category",
      },
      orderBy: {
        mid: "asc",
      },
    });

    return categories.map(category => ({
      mid: category.mid,
      name: category.name,
      slug: category.slug,
      desc: category.desc,
    }));
  } catch (error: any) {
    console.error("获取分类失败:", error);
    throw createError({
      statusCode: 500,
      message: "获取分类失败",
    });
  }
});
