import {sendTestEmail} from '#server/utils/mail'
import {getUser} from "#server/lib/auth";

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
    const body = await readBody(event)
    const to = body.to || body.adminEmail

    if (!to) {
      throw createError({
        statusCode: 400,
        message: '请提供收件人邮箱',
      })
    }

    return await sendTestEmail(to)
  } catch (error) {
    throw createError({
      statusCode: 500,
      message: error instanceof Error ? error.message : '发送测试邮件失败',
    })
  }
})
