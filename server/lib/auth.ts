import type { H3Event } from "h3";
import { setCookie, getCookie, deleteCookie } from "h3";

import { prisma } from "#server/utils/prisma";
import { getSessionStore, resetSessionStore } from "#server/utils/session-store";
import type { SessionUser } from "#server/types/auth";

const SESSION_COOKIE_NAME = "session";
const SESSION_MAX_AGE = 7 * 24 * 60 * 60; // 7 days

// 生成随机 session ID
function generateSessionId(): string {
  return Buffer.from(`${Date.now()}-${Math.random()}`).toString("base64");
}

// 生成 authCode（用于单端登录验证）
function generateAuthCode(): string {
  return Buffer.from(`${Date.now()}-${Math.random()}-${Math.random()}`).toString("base64url");
}

// 设置 session cookie
export async function setSession(event: H3Event, user: Omit<SessionUser, "authCode">): Promise<SessionUser> {
  const sessionId = generateSessionId();
  const authCode = generateAuthCode();
  const expires = Date.now() + SESSION_MAX_AGE * 1000;

  // 更新数据库中的 auth_code，实现单端登录
  await prisma.users.update({
    where: { uid: user.uid },
    data: { auth_code: authCode },
  });

  // 清除该用户的所有旧 session
  const store = await getSessionStore();
  await store.clearUserSessions(user.uid);

  // 保存新 session
  await store.set(sessionId, {
    userId: user.uid,
    authCode,
    expires,
  });

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
      role: true,
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
    role: user.role,
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

// 导出重置函数，供配置更改时调用
export { resetSessionStore };
