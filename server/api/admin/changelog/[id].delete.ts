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

  const id = Number(getRouterParam(event, "id"));

  if (!id) {
    throw createError({
      statusCode: 400,
      message: "ID 不能为空",
    });
  }

  // 检查日志是否存在
  const existing = await prisma.changelogs.findUnique({
    where: { id },
  });

  if (!existing) {
    throw createError({
      statusCode: 404,
      message: "更新日志不存在",
    });
  }

  // 删除日志
  await prisma.changelogs.delete({
    where: { id },
  });

  return {
    success: true,
    message: "删除成功",
  };
});
