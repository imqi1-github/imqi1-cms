import { getUser } from "#server/lib/auth";
import { validateCsrfToken } from "#server/utils/csrf";
import { renameTrustedDevice } from "#server/utils/trusted-device";

/** 后台：重命名一台已信任设备（PUT，CSRF 走 body csrfToken）；name 传空串/缺省则清空回「未知设备」 */
export default defineEventHandler(async event => {
  const user = await getUser(event);
  if (!user) {
    throw createError({ statusCode: 401, message: "未登录" });
  }

  const id = Number(getRouterParam(event, "id"));
  if (!Number.isInteger(id) || id <= 0) {
    throw createError({ statusCode: 400, message: "无效的设备 id" });
  }

  const body = (await readBody(event)) ?? {};
  const { csrfToken, name } = body;

  if (!validateCsrfToken(event, csrfToken)) {
    throw createError({ statusCode: 403, message: "CSRF token 验证失败，请刷新页面重试" });
  }

  // name：字符串（trim 后 ≤100 字，空则清空）；null/undefined 视为清空；其它类型报 400
  let newName: string | null = null;
  if (typeof name === "string") {
    const trimmed = name.trim();
    if (trimmed.length > 100) {
      throw createError({ statusCode: 400, message: "设备名称过长（不超过 100 字）" });
    }
    newName = trimmed || null;
  } else if (name !== null && name !== undefined) {
    throw createError({ statusCode: 400, message: "设备名称格式不正确" });
  }

  const n = await renameTrustedDevice(id, user.uid, newName);
  if (n === 0) {
    throw createError({ statusCode: 404, message: "该设备不存在或已被撤回" });
  }
  return { success: true, name: newName };
});
