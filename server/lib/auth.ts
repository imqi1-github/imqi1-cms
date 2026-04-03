import { prisma } from "#server/utils/prisma";

export interface SessionUser {
  uid: number;
  name: string;
  mail: string;
  avatar: string | null;
  role: number;
  authCode: string;
}

const SESSION_COOKIE_NAME = "session";
const SESSION_MAX_AGE = 7 * 24 * 60 * 60; // 7 days

// 简单的 session 存储（生产环境建议使用 Redis）
const sessions = new Map<string, { userId: number; authCode: string; expires: number }>();

// 生成随机 session ID
function generateSessionId(): string {
  return Buffer.from(`${Date.now()}-${Math.random()}`).toString("base64");
}

// 生成 authCode（用于单端登录验证）
function generateAuthCode(): string {
  return Buffer.from(`${Date.now()}-${Math.random()}-${Math.random()}`).toString("base64url");
}

// 清除用户的所有旧 session（用于单端登录）
function clearUserSessions(userId: number) {
  for (const [sessionId, session] of sessions.entries()) {
    if (session.userId === userId) {
      sessions.delete(sessionId);
    }
  }
}

// 设置 session cookie
export async function setSession(event: any, user: Omit<SessionUser, "authCode">): Promise<SessionUser> {
  const sessionId = generateSessionId();
  const authCode = generateAuthCode();
  const expires = Date.now() + SESSION_MAX_AGE * 1000;

  // 更新数据库中的 auth_code，实现单端登录
  await prisma.user.update({
    where: { uid: user.uid },
    data: { auth_code: authCode },
  });

  // 清除该用户的所有旧 session
  clearUserSessions(user.uid);

  sessions.set(sessionId, { userId: user.uid, authCode, expires });

  setCookie(event, SESSION_COOKIE_NAME, sessionId, {
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    maxAge: SESSION_MAX_AGE,
    path: "/",
  });

  return { ...user, authCode };
}

// 获取当前用户
export async function getUser(event: any): Promise<SessionUser | null> {
  const sessionId = getCookie(event, SESSION_COOKIE_NAME);

  if (!sessionId) {
    return null;
  }

  const session = sessions.get(sessionId);

  if (!session) {
    return null;
  }

  // 检查 session 是否过期
  if (Date.now() > session.expires) {
    sessions.delete(sessionId);
    return null;
  }

  const user = await prisma.user.findUnique({
    where: { uid: session.userId },
    select: {
      uid: true,
      name: true,
      mail: true,
      avatar: true,
      role: true,
      auth_code: true,
    },
  });

  if (!user) {
    sessions.delete(sessionId);
    return null;
  }

  // 验证 authCode，实现单端登录
  // 如果数据库中的 auth_code 与 session 中的不一致，说明已在其他设备登录
  if (user.auth_code !== session.authCode) {
    sessions.delete(sessionId);
    deleteCookie(event, SESSION_COOKIE_NAME, { path: "/" });
    return null;
  }

  return {
    uid: user.uid,
    name: user.name,
    mail: user.mail,
    avatar: user.avatar,
    role: user.role,
    authCode: session.authCode,
  };
}

// 清除 session
export function clearSession(event: any) {
  const sessionId = getCookie(event, SESSION_COOKIE_NAME);

  if (sessionId) {
    sessions.delete(sessionId);
  }

  deleteCookie(event, SESSION_COOKIE_NAME, { path: "/" });
}

// 验证密码（bcrypt）
export async function verifyPassword(password: string, hashedPassword: string): Promise<boolean> {
  const bcrypt = await import("bcrypt");
  return bcrypt.compare(password, hashedPassword);
}

// 需要认证的中间件
export async function requireAuth(event: any) {
  const user = await getUser(event);

  if (!user) {
    throw createError({
      statusCode: 401,
      message: "Unauthorized",
    });
  }

  return user;
}
