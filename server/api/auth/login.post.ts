import { setSession, verifyPassword } from "#server/lib/auth";
import { prisma } from "#server/utils/prisma";

export default defineEventHandler(async event => {
  const body = await readBody(event);

  const { username, password } = body;

  if (!username || !password) {
    throw createError({
      statusCode: 400,
      message: "请输入用户名和密码",
    });
  }

  // 查找用户
  const user = await prisma.user.findUnique({
    where: { name: username },
  });

  if (!user) {
    throw createError({
      statusCode: 401,
      message: "用户名或密码错误",
    });
  }

  // 验证密码
  const isValid = await verifyPassword(password, user.password);

  if (!isValid) {
    throw createError({
      statusCode: 401,
      message: "用户名或密码错误",
    });
  }

  // 设置 session（生成新的 authCode 实现单端登录）
  const sessionUser = await setSession(event, {
    uid: user.uid,
    name: user.name,
    mail: user.mail,
    avatar: user.avatar,
    role: user.role,
  });

  return {
    success: true,
    user: sessionUser,
  };
});
