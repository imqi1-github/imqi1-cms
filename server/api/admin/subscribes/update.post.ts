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
    throw createError({
      statusCode: 500,
      message: '更新订阅失败',
    });
  }
});
