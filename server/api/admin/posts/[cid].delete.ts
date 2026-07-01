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

  // 获取路由参数 - 使用 cid 匹配文件名 [cid].delete.ts
  const cid = getRouterParam(event, "cid");

  if (!cid) {
    throw createError({
      statusCode: 400,
      message: "缺少文章 ID",
    });
  }

  try {
    await prisma.posts.delete({
      where: { cid: Number(cid) },
    });
    return { success: true };
  } catch (error) {
    console.error(error);
    throw createError({
      statusCode: 500,
      message: "删除文章失败",
    });
  }
});
