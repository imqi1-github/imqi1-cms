import { getSubscriptionStats } from '#server/utils/rss';
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

  // 仅返回内存统计（更新次数/上次刷新/成功失败），重启归零，不持久化
  return getSubscriptionStats();
});
