import { getRecentLogs } from '#server/utils/mail'
import { getUser } from "#server/lib/auth";

export default defineEventHandler(async event => {
  // 验证用户登录
  const user = await getUser(event);

  if (!user) {
    throw createError({
      statusCode: 401,
      message: "请先登录",
    });
  }
  try {
    const logs = getRecentLogs(50)
    return { success: true, logs }
  } catch (error) {
    return { success: true, logs: [] }
  }
})
