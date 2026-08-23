import { updateAllSubscribes } from '#server/utils/rss';
import { getUser } from '#server/lib/auth';
import { validateCsrfToken } from '#server/utils/csrf';

export default defineEventHandler(async event => {
  // 验证用户登录
  const user = await getUser(event);

  if (!user) {
    throw createError({
      statusCode: 401,
      message: '请先登录',
    });
  }

  const body = await readBody(event).catch(() => ({} as { csrfToken?: string }));
  const { csrfToken } = body;

  if (!validateCsrfToken(event, csrfToken)) {
    throw createError({ statusCode: 403, message: 'CSRF token 验证失败，请刷新页面重试' });
  }

  console.log('[API] 开始更新所有订阅');
  try {
    const result = await updateAllSubscribes();
    console.log('[API] 订阅更新完成:', result);
    return {
      success: true,
      data: result,
    };
  } catch (error) {
    console.error(error);
    // 已带 statusCode 的错误（400/403）原样抛出，避免被统一吞成 500
    if (error && typeof error === "object" && "statusCode" in error) {
      throw error;
    }
    throw createError({
      statusCode: 500,
      message: '更新订阅失败',
    });
  }
});
