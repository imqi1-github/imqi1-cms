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
      message: "缺少用户 ID",
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

  try {
    // 检查是否尝试删除自己
    if (user.uid === Number(id)) {
      throw createError({
        statusCode: 400,
        message: "不允许删除自己的账号",
      });
    }

    // 检查系统中的用户总数
    const userCount = await prisma.user.count();

    // 如果只有一个用户，不允许删除
    if (userCount <= 1) {
      throw createError({
        statusCode: 400,
        message: "系统中只有一个用户，不允许删除",
      });
    }

    // 检查用户是否有文章
    const postCount = await prisma.post.count({
      where: { uid: Number(id) },
    });

    if (postCount > 0) {
      throw createError({
        statusCode: 400,
        message: `该用户有 ${postCount} 篇文章，无法删除。请先删除或转移这些文章。`,
      });
    }

    await prisma.user.delete({
      where: { uid: Number(id) },
    });
    return { success: true };
  } catch (error: any) {
    // 如果是我们抛出的错误，直接传递
    if (error.statusCode) {
      throw error;
    }

    // 记录详细的错误信息
    console.error("删除用户失败:", error);

    // 检查是否是外键约束错误
    if (error.code === 'P2003') {
      throw createError({
        statusCode: 400,
        message: "该用户有关联的数据，无法删除",
      });
    }

    // 检查是否是记录不存在
    if (error.code === 'P2025') {
      throw createError({
        statusCode: 404,
        message: "用户不存在",
      });
    }

    throw createError({
      statusCode: 500,
      message: "删除用户失败: " + (error.message || "未知错误"),
    });
  }
});
