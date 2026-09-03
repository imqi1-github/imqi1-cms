import { getCookie } from "h3";

import { setSession, verifyPassword } from "#server/lib/auth";
import { getClientIp } from "#server/utils/client-ip";
import { prisma } from "#server/utils/prisma";
import { validateCsrfToken } from "#server/utils/csrf";
import { verifyCaptcha } from "#server/utils/captcha";
import {
  checkLoginRateLimit,
  recordLoginFailure,
  resetLoginAttempts,
  hasRecentFailures,
} from "#server/utils/login-rate-limit";
import {
  makeLoginChallenge,
  verifyTrustedDevice,
  TRUSTED_DEVICE_COOKIE,
} from "#server/utils/security-token";

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

export default defineEventHandler(async event => {
  const body = await readBody(event);
  const { csrfToken, username, password, captcha } = body ?? {};

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
  const limit = await checkLoginRateLimit(ip);
  if (limit.locked) {
    const retryAfterSec = Math.ceil(limit.retryAfter / 1000);
    setResponseHeader(event, "Retry-After", retryAfterSec);
    throw createError({
      statusCode: 429,
      message: `登录尝试过于频繁，请 ${retryAfterSec} 秒后重试`,
    });
  }

  // CSRF 验证（先于验证码：CSRF 失败不改动一次性验证码，避免误伤）
  if (!validateCsrfToken(event, csrfToken)) {
    throw createError({
      statusCode: 403,
      message: "CSRF token 验证失败，请刷新页面重试",
    });
  }

  // 自适应图形验证码：该 IP 在窗口内已有失败才要求（平时零摩擦，一旦被撞过就上验证码）。
  // 须先于 bcrypt，挡住脚本对昂贵哈希的洪峰；captcha 为可选字符串（未要求时不校验）。
  const requireCaptcha = await hasRecentFailures(ip);
  if (requireCaptcha) {
    if (typeof captcha !== "string" || !verifyCaptcha(event, captcha)) {
      throw createError({
        statusCode: 400,
        message: "请输入正确的验证码",
        data: { captchaRequired: true },
      });
    }
  }

  try {
    // 查找用户：2FA 需 totp_secret/totp_enabled，auth_code 无需进内存
    const user = await prisma.users.findUnique({
      where: { name: username },
      select: {
        uid: true,
        name: true,
        nickname: true,
        mail: true,
        avatar: true,
        password: true,
        totp_secret: true,
        totp_enabled: true,
      },
    });

    const userSafe = user
      ? {
          uid: user.uid,
          name: user.name,
          nickname: user.nickname,
          mail: user.mail,
          avatar: user.avatar,
        }
      : null;

    if (!user) {
      // 用户不存在：跑一次 bcrypt 拉平时延，避免基于响应时间区分用户名是否存在
      await verifyPassword(password, await getDummyHash());
      await recordLoginFailure(ip);
      throw createError({
        statusCode: 401,
        message: "用户名或密码错误",
      });
    }

    // 验证密码
    const isValid = await verifyPassword(password, user.password);

    if (!isValid) {
      await recordLoginFailure(ip);
      throw createError({
        statusCode: 401,
        message: "用户名或密码错误",
      });
    }

    // 密码正确：清该 IP 失败计数（后续步骤若失败再由 2FA 层另行计数）
    await resetLoginAttempts(ip);

    // 已启用 2FA：若「信任此设备」cookie 有效，则免第二因素直接放行；否则下发一次性 challenge
    if (user.totp_enabled) {
      const trusted = getCookie(event, TRUSTED_DEVICE_COOKIE);
      if (trusted && verifyTrustedDevice(trusted, user.uid)) {
        await setSession(event, userSafe!);
        return { success: true, user: userSafe! };
      }
      return {
        success: false,
        pending2FA: true,
        challenge: makeLoginChallenge(user.uid),
      };
    }

    // 未启用 2FA：直接建会话
    await setSession(event, userSafe!);
    return { success: true, user: userSafe! };
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
