import { getUser } from "#server/lib/auth";
import { prisma } from "#server/utils/prisma";
import { validateCsrfToken } from "#server/utils/csrf";

export default defineEventHandler(async event => {
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
      message: "缺少标签 ID",
    });
  }

  // CSRF 验证 - 从请求头获取（避免 token 进入 URL 被日志/Referer 记录）
  const csrfToken = getHeader(event, "x-csrf-token") as string;
  if (!validateCsrfToken(event, csrfToken)) {
    throw createError({
      statusCode: 403,
      message: "CSRF token 验证失败，请刷新页面重试",
    });
  }

  const tagId = Number(id);

  try {
    const tagToDelete = await prisma.metas.findUnique({
      where: { mid: tagId },
    });

    if (!tagToDelete) {
      throw createError({
        statusCode: 404,
        message: "标签不存在",
      });
    }

    if (tagToDelete.type !== "tag") {
      throw createError({
        statusCode: 400,
        message: "只能删除标签类型",
      });
    }

    await prisma.contentrelations.deleteMany({
      where: { mid: tagId },
    });

    await prisma.metas.delete({
      where: { mid: tagId },
    });

    return { success: true };
  } catch (error) {
    console.error(error);
    if (error instanceof Error && 'statusCode' in error) {
      throw error;
    }
    throw createError({
      statusCode: 500,
      message: "删除标签失败",
    });
  }
});
