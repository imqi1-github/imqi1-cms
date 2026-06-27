import { prisma } from "#server/utils/prisma";
import { getUser } from "#server/lib/auth";
import { validateCsrfToken } from "#server/utils/csrf";

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
      message: "缺少分类 ID",
    });
  }

  // CSRF 验证 - 从查询参数获取
  const csrfToken = getQuery(event).csrfToken as string;
  if (!validateCsrfToken(event, csrfToken)) {
    throw createError({
      statusCode: 403,
      message: "CSRF token 验证失败，请刷新页面重试",
    });
  }

  const categoryId = Number(id);

  // 检查分类总数，至少保留一个分类
  const categoryCount = await prisma.metas.count({
    where: { type: "category" },
  });

  if (categoryCount <= 1) {
    throw createError({
      statusCode: 400,
      message: "至少需要保留一个分类",
    });
  }

  try {
    // 获取要删除的分类
    const categoryToDelete = await prisma.metas.findUnique({
      where: { mid: categoryId },
    });

    if (!categoryToDelete) {
      throw createError({
        statusCode: 404,
        message: "分类不存在",
      });
    }

    // 获取该分类下的所有文章关联
    const postrelations = await prisma.postrelations.findMany({
      where: { mid: categoryId },
      select: { cid: true },
    });

    // 如果有关联文章，需要转移到其他分类
    if (postrelations.length > 0) {
      // 获取第一个可用的目标分类（不是要删除的分类）
      const targetCategory = await prisma.metas.findFirst({
        where: {
          type: "category",
          mid: { not: categoryId },
        },
        select: { mid: true },
      });

      if (!targetCategory) {
        throw createError({
          statusCode: 400,
          message: "没有可用的目标分类进行转移",
        });
      }

      // 获取每个文章当前的所有分类
      for (const relation of postrelations) {
        // 检查该文章是否还有其他分类
        const otherRelations = await prisma.postrelations.findMany({
          where: {
            cid: relation.cid,
            mid: { not: categoryId },
          },
        });

        // 如果文章没有其他分类了，创建新的关联到目标分类
        if (otherRelations.length === 0) {
          await prisma.postrelations.create({
            data: {
              cid: relation.cid,
              mid: targetCategory.mid,
            },
          });
        }
      }

      // 删除原分类的所有关联关系
      await prisma.postrelations.deleteMany({
        where: { mid: categoryId },
      });
    }

    // 删除分类
    await prisma.metas.delete({
      where: { mid: categoryId },
    });

    return { success: true };
  } catch (error) {
    // 如果是我们抛出的错误，直接传递
    if (error instanceof Error && 'statusCode' in error) {
      throw error;
    }

    // 记录详细的错误信息
    console.error(error);

    throw createError({
      statusCode: 500,
      message: "删除分类失败: " + ((error instanceof Error ? error.message : String(error)) || "未知错误"),
    });
  }
});
