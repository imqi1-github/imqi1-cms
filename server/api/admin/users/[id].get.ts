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

  const id = getRouterParam(event, "id");
  if (!id) {
    throw createError({
      statusCode: 400,
      message: "缺少用户 ID",
    });
  }
  const uid = Number(id);
  if (!Number.isInteger(uid) || uid <= 0) {
    throw createError({
      statusCode: 400,
      message: "无效的用户 ID",
    });
  }

  // IDOR 防御：会话用户只能查看自己的账户（与 PUT 对齐；否则任意登录用户可枚举他人邮箱/昵称）
  if (user.uid !== uid) {
    throw createError({
      statusCode: 403,
      message: "无权查看该账户",
    });
  }

  try {
    // 用 target 名（外层 user 是鉴权登录用户，避免同名遮蔽）
    const target = await prisma.users.findUnique({
      where: { uid },
      select: {
        uid: true,
        name: true,
        nickname: true,
        mail: true,
        avatar: true,
        create_time: true,
      },
    });

    if (!target) {
      throw createError({
        statusCode: 404,
        message: "用户不存在",
      });
    }

    return target;
  } catch (error) {
    // 预期 400/404 原样抛，不打印完整堆栈
    if (error instanceof Error && "statusCode" in error) {
      throw error;
    }
    console.error(error);
    throw createError({
      statusCode: 500,
      message: "获取用户失败",
    });
  }
});
