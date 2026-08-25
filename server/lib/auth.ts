import { randomBytes } from "crypto";

import type { H3Event } from "h3";
import { setCookie, getCookie, deleteCookie } from "h3";

import { prisma } from "#server/utils/prisma";
import { getSessionStore } from "#server/utils/session-store";
import type { SessionUser } from "#server/types/auth";

const SESSION_COOKIE_NAME = "session";
const SESSION_MAX_AGE = 7 * 24 * 60 * 60; // 7 days

// 生成密码学安全的随机 session ID
// 必须使用 crypto.randomBytes，不能用 Math.random()（可预测，会导致会话预测/劫持）。
// 用 base64url 还能保证字符集 [A-Za-z0-9_-] 对文件名/cookie/DB 主键都安全。
function generateSessionId(): string {
  return randomBytes(32).toString("base64url");
}

// 生成 authCode（用于单端登录验证），同样必须使用密码学安全随机源
function generateAuthCode(): string {
  return randomBytes(32).toString("base64url");
}

// 设置 session cookie
export async function setSession(event: H3Event, user: Omit<SessionUser, "authCode">): Promise<SessionUser> {
  const sessionId = generateSessionId();
  const authCode = generateAuthCode();
  const expires = Date.now() + SESSION_MAX_AGE * 1000;

  const store = await getSessionStore();

  // 先持久化新 session：必须放在旋转 auth_code / 清除旧 session 之前。
  // 若 store.set 失败，此时 auth_code 未旋转、旧 session 未被清除，用户仍保有有效登录态；
  // 反之（旧顺序先旋转 auth_code 再清旧 session 最后才 store.set），一旦 store 写失败
  // 用户将只剩零个有效 session，被迫在全部设备登出。
  await store.set(sessionId, {
    userId: user.uid,
    authCode,
    expires,
  });

  // 再旋转数据库中的 auth_code，实现单端登录：
  // 旧设备的 session 因 authCode 不匹配，在下次 getUser() 校验时自动失效（见 getUser）。
  await prisma.users.update({
    where: { uid: user.uid },
    data: { auth_code: authCode },
  });

  // 此处不再单独清除旧 session。store.clearUserSessions 按 userId 删除该用户全部会话：
  // 在 store.set 之后再调用会把刚创建的新 session 一并删除；在 store.set 之前调用又会令
  // store.set 一失败用户便丢失全部登录态。故单端登录完全依赖上面的 auth_code 旋转实现
  // （旧会话在 getUser() 时因 authCode 不匹配被删除），过期的孤儿会话由 store.cleanup()
  // 周期清理，无需在此逐个清点。

  setCookie(event, SESSION_COOKIE_NAME, sessionId, {
    secure: import.meta.env.PROD, // 生产环境使用 HTTPS 传输
    httpOnly: true, // 防止 JavaScript 访问，防止 XSS 窃取
    sameSite: import.meta.env.PROD ? "strict" : "lax", // 开发环境使用 lax 以支持重定向，生产环境使用 strict
    maxAge: SESSION_MAX_AGE,
    path: "/",
    // 开发环境额外添加 domain 属性（如果需要）
    ...(import.meta.env.DEV && { domain: undefined }),
  });

  return { ...user, authCode };
}

// 获取当前用户
export async function getUser(event: H3Event): Promise<SessionUser | null> {
  const sessionId = getCookie(event, SESSION_COOKIE_NAME);

  if (!sessionId) {
    return null;
  }

  const store = await getSessionStore();
  const session = await store.get(sessionId);

  if (!session) {
    return null;
  }

  const user = await prisma.users.findUnique({
    where: { uid: session.userId },
    select: {
      uid: true,
      name: true,
      nickname: true,
      mail: true,
      avatar: true,
      auth_code: true,
    },
  });

  if (!user) {
    await store.delete(sessionId);
    return null;
  }

  // 验证 authCode，实现单端登录
  // 如果数据库中的 auth_code 与 session 中的不一致，说明已在其他设备登录
  if (user.auth_code !== session.authCode) {
    await store.delete(sessionId);
    deleteCookie(event, SESSION_COOKIE_NAME, { path: "/" });
    return null;
  }

  return {
    uid: user.uid,
    name: user.name,
    nickname: user.nickname,
    mail: user.mail,
    avatar: user.avatar,
    authCode: session.authCode,
  };
}

// 清除 session
export async function clearSession(event: H3Event) {
  const sessionId = getCookie(event, SESSION_COOKIE_NAME);

  if (sessionId) {
    const store = await getSessionStore();
    await store.delete(sessionId);
  }

  deleteCookie(event, SESSION_COOKIE_NAME, { path: "/" });
}

// 验证密码（bcrypt）
export async function verifyPassword(password: string, hashedPassword: string): Promise<boolean> {
  const bcrypt = await import("bcryptjs");
  return bcrypt.default.compare(password, hashedPassword);
}
