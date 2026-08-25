import { getUser } from "#server/lib/auth";

export default defineEventHandler(async event => {
  // 用户敏感接口：禁止任何代理/浏览器缓存，避免他人机器拿到本用户资料
  setResponseHeader(event, "Cache-Control", "no-store");

  const user = await getUser(event);

  if (!user) {
    throw createError({
      statusCode: 401,
      message: "Unauthorized",
    });
  }

  // 仅返回前端需要的字段；authCode 是单端登录内部标记，不应暴露给浏览器
  return {
    uid: user.uid,
    name: user.name,
    nickname: user.nickname,
    mail: user.mail,
    avatar: user.avatar,
  };
});
