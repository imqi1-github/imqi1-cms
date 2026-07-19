import {sendTestEmail} from '#server/utils/mail'
import {getUser} from "#server/lib/auth";
import {validateCsrfToken} from "#server/utils/csrf";

export default defineEventHandler(async event => {
  // 验证用户登录
  const user = await getUser(event);

  if (!user) {
    throw createError({
      statusCode: 401,
      message: "请先登录",
    });
  }

  const body = await readBody(event)
  const {csrfToken} = body

  // CSRF 验证（位于下方 try/catch 之外，避免 403 被吞成 500）
  if (!validateCsrfToken(event, csrfToken)) {
    throw createError({
      statusCode: 403,
      message: "CSRF token 验证失败，请刷新页面重试",
    });
  }

  try {
    const to = body.to || body.adminEmail

    if (!to) {
      throw createError({
        statusCode: 400,
        message: '请提供收件人邮箱',
      })
    }

    return await sendTestEmail(to)
  } catch (error) {
    console.error(error);
    if (error && typeof error === "object" && "statusCode" in error) throw error;
    throw createError({
      statusCode: 500,
      message: error instanceof Error ? error.message : '发送测试邮件失败',
    })
  }
})
