import { setCookie } from "h3";

import { setSession } from "#server/lib/auth";
import { getClientIp } from "#server/utils/client-ip";
import { prisma } from "#server/utils/prisma";
import { verifyTOTP } from "#server/utils/totp";
import {
  checkLoginRateLimit,
  recordLoginFailure,
  resetLoginAttempts,
} from "#server/utils/login-rate-limit";
import {
  verifyLoginChallenge,
  makeTrustedDevice,
  TRUSTED_DEVICE_COOKIE,
} from "#server/utils/security-token";

/**
 * 登录第二因素（TOTP）校验：密码已通过、登录返回 pending2FA + challenge 后调用。
 * 校验 challenge（绑定 uid、5 分钟）→ 校验 6 位动态码 → 建会话（可选「信任此设备」）。
 */
export default defineEventHandler(async event => {
  const body = await readBody(event);
  const { challenge, code, rememberDevice } = body ?? {};

  if (
    typeof challenge !== "string" ||
    typeof code !== "string" ||
    !/^\d{6}$/.test(code.trim())
  ) {
    throw createError({ statusCode: 400, message: "请输入 6 位动态验证码" });
  }

  const ip = getClientIp(event);
  const limit = await checkLoginRateLimit(ip);
  if (limit.locked) {
    const retryAfterSec = Math.ceil(limit.retryAfter / 1000);
    setResponseHeader(event, "Retry-After", retryAfterSec);
    throw createError({
      statusCode: 429,
      message: `尝试过于频繁，请 ${retryAfterSec} 秒后重试`,
    });
  }

  // challenge 与某用户的本次登录强绑定
  const uid = verifyLoginChallenge(challenge);
  if (!uid) {
    throw createError({ statusCode: 400, message: "登录已过期，请重新登录" });
  }

  const user = await prisma.users.findUnique({
    where: { uid },
    select: {
      uid: true,
      name: true,
      nickname: true,
      mail: true,
      avatar: true,
      totp_secret: true,
      totp_enabled: true,
    },
  });

  if (!user || !user.totp_enabled || !user.totp_secret) {
    throw createError({ statusCode: 400, message: "该账户未启用两步验证" });
  }

  if (!verifyTOTP(user.totp_secret, code)) {
    await recordLoginFailure(ip);
    throw createError({ statusCode: 401, message: "动态验证码错误" });
  }

  // TOTP 通过：清失败计数，可选写「信任此设备」cookie
  await resetLoginAttempts(ip);
  if (rememberDevice) {
    setCookie(event, TRUSTED_DEVICE_COOKIE, makeTrustedDevice(user.uid), {
      httpOnly: true,
      secure: import.meta.env.PROD,
      sameSite: import.meta.env.PROD ? "strict" : "lax",
      maxAge: 30 * 24 * 3600,
      path: "/",
    });
  }

  await setSession(event, {
    uid: user.uid,
    name: user.name,
    nickname: user.nickname,
    mail: user.mail,
    avatar: user.avatar,
  });

  return {
    success: true,
    user: {
      uid: user.uid,
      name: user.name,
      nickname: user.nickname,
      mail: user.mail,
      avatar: user.avatar,
    },
  };
});
