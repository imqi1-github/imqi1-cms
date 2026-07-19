import type { H3Event } from "h3";

import { setSession, verifyPassword } from "#server/lib/auth";
import { prisma } from "#server/utils/prisma";
import { validateCsrfToken } from "#server/utils/csrf";
import {
  checkLoginRateLimit,
  recordLoginFailure,
  resetLoginAttempts,
} from "#server/utils/login-rate-limit";

// 登录请求入参的最大长度，避免超长输入造成不必要的 bcrypt/DB 开销
const MAX_USERNAME_LEN = 64;
const MAX_PASSWORD_LEN = 256;

// 占位 bcrypt 哈希：用户不存在时仍跑一次 compare，拉平时延，
// 避免攻击者基于响应快慢区分“用户名是否存在”
let dummyHashPromise: Promise<string> | null = null;
async function getDummyHash(): Promise<string> {
  if (!dummyHashPromise) {
    const { default: bcrypt } = await import("bcryptjs");
    dummyHashPromise = bcrypt.hash("dummy-login-secret", 10);
  }
  return dummyHashPromise;
}

// 从请求头解析客户端 IP（优先取 X-Forwarded-For 首段）
function getClientIp(event: H3Event): string {
  const xff = getHeader(event, "x-forwarded-for");
  if (typeof xff === "string" && xff.length > 0) {
    return (xff.split(",")[0] ?? "").trim();
  }
  return "unknown";
}

export default defineEventHandler(async event => {
  const body = await readBody(event);
  const { csrfToken, username, password } = body ?? {};

  // 入参基础校验（shape + 长度），避免异常输入击穿到 Prisma/校验链路
  if (
    typeof csrfToken !== "string" ||
    typeof username !== "string" ||
    typeof password !== "string" ||
    username.trim().length === 0 ||
    password.length === 0 ||
    username.length > MAX_USERNAME_LEN ||
    password.length > MAX_PASSWORD_LEN
  ) {
    throw createError({
      statusCode: 400,
      message: "请输入用户名和密码",
    });
  }

  // 限流：按 IP 拦截暴力破解（在 CSRF 之前，让锁定中的洪水请求最早被拒）
  const ip = getClientIp(event);
  const limit = checkLoginRateLimit(ip);
  if (limit.locked) {
    const retryAfterSec = Math.ceil(limit.retryAfter / 1000);
    setResponseHeader(event, "Retry-After", retryAfterSec);
    throw createError({
      statusCode: 429,
      message: `登录尝试过于频繁，请 ${retryAfterSec} 秒后重试`,
    });
  }

  // CSRF 验证
  if (!validateCsrfToken(event, csrfToken)) {
    throw createError({
      statusCode: 403,
      message: "CSRF token 验证失败，请刷新页面重试",
    });
  }

  try {
    // 查找用户
    const user = await prisma.users.findUnique({
      where: { name: username },
    });

    if (!user) {
      // 用户不存在：跑一次 bcrypt 拉平时延，避免基于响应时间区分用户名是否存在
      await verifyPassword(password, await getDummyHash());
      recordLoginFailure(ip);
      throw createError({
        statusCode: 401,
        message: "用户名或密码错误",
      });
    }

    // 验证密码
    const isValid = await verifyPassword(password, user.password);

    if (!isValid) {
      recordLoginFailure(ip);
      throw createError({
        statusCode: 401,
        message: "用户名或密码错误",
      });
    }

    // 登录成功，重置该 IP 的失败计数
    resetLoginAttempts(ip);

    // 设置 session（生成新的 authCode 实现单端登录）
    const sessionUser = await setSession(event, {
      uid: user.uid,
      name: user.name,
      nickname: user.nickname,
      mail: user.mail,
      avatar: user.avatar,
    });

    // 仅返回前端需要的字段；authCode 是单端登录内部标记，不暴露给浏览器
    return {
      success: true,
      user: {
        uid: sessionUser.uid,
        name: sessionUser.name,
        nickname: sessionUser.nickname,
        mail: sessionUser.mail,
        avatar: sessionUser.avatar,
      },
    };
  } catch (error) {
    // 已构造的业务错误（带 statusCode）原样抛出，避免被下面的 500 吞掉
    if (error && typeof error === "object" && "statusCode" in error) {
      throw error;
    }

    console.error("登录失败:", error);
    throw createError({
      statusCode: 500,
      message: "登录失败，请稍后重试",
    });
  }
});
