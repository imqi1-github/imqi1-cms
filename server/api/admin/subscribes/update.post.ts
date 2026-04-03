import { updateAllSubscribes } from '#server/utils/rss';
import { getUser } from '#server/lib/auth';

export default defineEventHandler(async event => {
  // 验证用户登录
  const user = await getUser(event);

  if (!user) {
    throw createError({
      statusCode: 401,
      message: '请先登录',
    });
  }

  try {
    const result = await updateAllSubscribes();
    return {
      success: true,
      data: result,
    };
  } catch (error) {
    console.error('更新订阅失败:', error);
    throw createError({
      statusCode: 500,
      message: '更新订阅失败',
    });
  }
});
