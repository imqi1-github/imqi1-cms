import { updateAllSubscribes } from '#server/utils/rss';
import { getUser } from '#server/lib/auth';
import { validateCsrfToken } from '#server/utils/csrf';
import { invalidateContentCaches } from '#server/utils/content-cache';
import { SUBSCRIBE_CACHE_ROUTES } from '#shared/constants';

export default defineEventHandler(async event => {
  // 验证用户登录
  const user = await getUser(event);

  if (!user) {
    throw createError({
      statusCode: 401,
      message: '请先登录',
    });
  }

  const body = ((await readBody(event).catch(() => ({}))) ?? {});
  const { csrfToken } = body;

  if (!validateCsrfToken(event, csrfToken)) {
    throw createError({ statusCode: 403, message: 'CSRF token 验证失败，请刷新页面重试' });
  }

  // 提交后台更新任务：不等抓取完成，立即返回（发起一次定时任务等价操作，更新所有订阅文章）。
  // 失败仅记录日志，不阻塞/报错本次请求；前端无需拿结果，改由「刷新订阅状态」重新拉取列表。
  void updateAllSubscribes().catch(error => {
    console.error("[订阅更新] 后台更新任务异常:", error);
  });

  // 用户点了按钮就该立刻看到反馈：先失效订阅相关 ISR（首页/订阅页/地图的订阅卡片），
  // 抓取完成后 rss.ts:295 会再失效一次（双失效幂等）。
  void invalidateContentCaches({ routes: SUBSCRIBE_CACHE_ROUTES }).catch(error => {
    console.error("[cache] 订阅更新失效缓存失败:", error);
  });

  return {
    success: true,
    data: { started: true },
  };
});
