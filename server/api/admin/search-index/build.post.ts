// 建立/更新前台搜索索引（管理员手动触发）。
// 同步执行：单用户站点的语料规模下可接受；若后续站点变大，可改为异步任务 + 轮询状态。
import { getUser } from "#server/lib/auth";
import { validateCsrfToken } from "#server/utils/csrf";
import { buildSearchIndex } from "#server/utils/search-index";

export default defineEventHandler(async (event) => {
  const body = await readBody<{ csrfToken?: string }>(event);
  if (!validateCsrfToken(event, body?.csrfToken)) {
    throw createError({
      statusCode: 403,
      message: "CSRF token 验证失败，请刷新页面重试",
    });
  }
  const user = await getUser(event);
  if (!user) {
    throw createError({ statusCode: 401, message: "请先登录" });
  }

  try {
    const result = await buildSearchIndex();
    // 未配置 Redis
    if (result.count === -2) {
      return {
        success: false,
        count: -2,
        durationMs: 0,
        message: "未配置 Redis 连接，无法建立搜索索引",
      };
    }
    // 另一构建进行中（Redis 锁未拿到）
    if (result.count === -1) {
      return { success: false, count: -1, durationMs: -1, message: "索引正在后台构建中，请稍后再试" };
    }
    return {
      success: true,
      count: result.count,
      durationMs: result.durationMs,
      message: `已重建 ${result.count} 条搜索索引（耗时 ${result.durationMs}ms）`,
    };
  } catch (error) {
    console.error("[搜索索引构建失败]", error);
    throw createError({ statusCode: 500, message: "搜索索引构建失败" });
  }
});
