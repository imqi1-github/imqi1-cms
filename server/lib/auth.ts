import { prisma } from "#server/utils/prisma";

export interface SessionUser {
  id: number;
  name: string;
  mail: string;
  avatar: string | null;
  role: number;
}

const SESSION_COOKIE_NAME = "session";
const SESSION_MAX_AGE = 7 * 24 * 60 * 60; // 7 days

// 简单的 session 存储（生产环境建议使用 Redis）
const sessions = new Map<string, { userId: number; expires: number }>();

// 生成随机 session ID
function generateSessionId(): string {
  return Buffer.from(`${Date.now()}-${Math.random()}`).toString("base64");
}

// 设置 session cookie
export function setSession(event: any, user: SessionUser) {
  const sessionId = generateSessionId();
  const expires = Date.now() + SESSION_MAX_AGE * 1000;

  sessions.set(sessionId, { userId: user.id, expires });

  setCookie(event, SESSION_COOKIE_NAME, sessionId, {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    maxAge: SESSION_MAX_AGE,
    path: "/",
  });

  return user;
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
    where: { id: session.userId },
    select: {
      id: true,
      name: true,
      mail: true,
      avatar: true,
      role: true,
    },
  });

  if (!user) {
    sessions.delete(sessionId);
    return null;
  }

  return user;
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
