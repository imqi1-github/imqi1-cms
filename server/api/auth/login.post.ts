import { setSession, verifyPassword } from "#server/lib/auth";
import { prisma } from "#server/utils/prisma";
import { validateCsrfToken } from "#server/utils/csrf";

export default defineEventHandler(async event => {
  const body = await readBody(event);
  const { csrfToken, username, password } = body;

  // CSRF 验证
  if (!validateCsrfToken(event, csrfToken)) {
    throw createError({
      statusCode: 403,
      message: "CSRF token 验证失败，请刷新页面重试",
    });
  }

  if (!username || !password) {
    throw createError({
      statusCode: 400,
      message: "请输入用户名和密码",
    });
  }

  // 查找用户
  const user = await prisma.users.findUnique({
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
    nickname: user.nickname,
    mail: user.mail,
    avatar: user.avatar,
    role: user.role,
  });

  return {
    success: true,
    user: sessionUser,
  };
});
