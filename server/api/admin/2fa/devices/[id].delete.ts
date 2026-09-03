import { getHeader } from "h3";

import { getUser } from "#server/lib/auth";
import { validateCsrfToken } from "#server/utils/csrf";
import { revokeTrustedDevice } from "#server/utils/trusted-device";

/** 后台：撤回一台已信任设备（DELETE，CSRF 走 x-csrf-token 头） */
export default defineEventHandler(async event => {
  const user = await getUser(event);
  if (!user) {
    throw createError({ statusCode: 401, message: "未登录" });
  }
  if (!validateCsrfToken(event, getHeader(event, "x-csrf-token"))) {
    throw createError({ statusCode: 403, message: "CSRF token 验证失败，请刷新页面重试" });
  }

  const id = Number(getRouterParam(event, "id"));
  if (!Number.isInteger(id) || id <= 0) {
    throw createError({ statusCode: 400, message: "无效的设备 id" });
  }

  const n = await revokeTrustedDevice(id, user.uid);
  if (n === 0) {
    throw createError({ statusCode: 404, message: "该设备不存在或已被撤回" });
  }
  return { success: true };
});
