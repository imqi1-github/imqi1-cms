import { sendTestEmail } from '#server/utils/mail'

export default defineEventHandler(async event => {
  try {
    const body = await readBody(event)
    const to = body.to || body.adminEmail

    if (!to) {
      throw createError({
        statusCode: 400,
        message: '请提供收件人邮箱',
      })
    }

    const result = await sendTestEmail(to)
    return result
  } catch (error) {
    throw createError({
      statusCode: 500,
      message: error instanceof Error ? error.message : '发送测试邮件失败',
    })
  }
})
