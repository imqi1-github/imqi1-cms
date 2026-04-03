import { getUser } from "#server/lib/auth";

/**
 * 验证当前会话是否有效
 * 用于检查是否在其他设备登录（单端登录）
 */
export default defineEventHandler(async event => {
  const user = await getUser(event);

  if (!user) {
    return {
      valid: false,
      message: "会话已失效，可能已在其他设备登录",
    };
  }

  return {
    valid: true,
    user: {
      id: user.id,
      name: user.name,
      mail: user.mail,
      avatar: user.avatar,
      role: user.role,
    },
  };
});
