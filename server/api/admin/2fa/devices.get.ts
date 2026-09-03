import { getUser } from "#server/lib/auth";
import { listTrustedDevices } from "#server/utils/trusted-device";

/** 后台：列出当前账户的已信任设备（GET） */
export default defineEventHandler(async event => {
  const user = await getUser(event);
  if (!user) {
    throw createError({ statusCode: 401, message: "未登录" });
  }

  const devices = await listTrustedDevices(user.uid);
  return { devices };
});
