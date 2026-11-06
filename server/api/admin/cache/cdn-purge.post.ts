import { getUser } from "#server/lib/auth";
import { validateCsrfToken } from "#server/utils/csrf";
import { logAdminAudit } from "#server/utils/audit";
import { createCdnProvider, isCdnDisabledByEnv, runCdnPurge } from "#server/utils/cdn";
import type { CdnPurgeResult } from "#server/types/utils/cdn";
import { log } from "#server/utils/log";
import type { CdnPurgeBody, CdnPurgeResponse } from "#server/types/apis/cache";

/**
 * 手动触发 CDN 边缘缓存刷新
 *
 * 写库后已自动刷新受影响的页面（见 server/utils/content-cache.ts），这里是给运营手动兜底：
 * 改了站外配置、发现某个页面没更新、或换 CDN 规则后想立刻生效时用。
 */
export default defineEventHandler(async event => {
  const body = await readBody<CdnPurgeBody>(event);
  const { csrfToken, action, routes, urls, jobId } = body ?? {};

  if (!validateCsrfToken(event, csrfToken)) {
    throw createError({
      statusCode: 403,
      message: "CSRF token 验证失败，请刷新页面重试",
    });
  }

  const user = await getUser(event);
  if (!user) {
    throw createError({
      statusCode: 401,
      message: "请先登录",
    });
  }

  const provider = createCdnProvider();
  if (!provider?.isEnabled()) {
    return {
      success: false,
      requested: 0,
      message: isCdnDisabledByEnv()
        ? "开发环境不启用 CDN 刷新"
        : "未配置 CDN 刷新（缺少 EDGEONE_ZONE_ID / EDGEONE_SECRET_ID / EDGEONE_SECRET_KEY）",
    } satisfies CdnPurgeResponse;
  }

  try {
    const result = await runPurge(provider, action, routes, urls, jobId);

    await logAdminAudit({
      actor: { uid: user.uid, name: user.name },
      action: "cache.cdn_purge",
      target: { type: "cache" },
      diff: { 操作: action ?? "", 路由: routes?.join(",") || "", 目标数: result.requested, 任务号: result.taskId },
    });

    return {
      success: result.success,
      provider: provider.name,
      requested: result.requested,
      taskId: result.taskId,
      status: result.status,
      message: result.success ? undefined : result.error,
      note: result.note,
    } satisfies CdnPurgeResponse;
  } catch (error) {
    // 带 statusCode 的错误（400/403/401）原样抛，避免被 500 覆盖
    if (error && typeof error === "object" && "statusCode" in error) {
      throw error;
    }
    console.error("[cache/cdn-purge] 刷新失败:", error);
    throw createError({ statusCode: 500, message: "CDN 刷新失败" });
  }
});

/** 按操作类型分发到 provider 的对应能力（刷新统一走 runCdnPurge，日志口径与自动刷新一致） */
async function runPurge(
  provider: NonNullable<ReturnType<typeof createCdnProvider>>,
  action: CdnPurgeBody["action"] | undefined,
  routes: string[] | undefined,
  urls: string[] | undefined,
  jobId: string | undefined,
) {
  if (action === "urls") {
    const list = toStringList(urls);
    if (!list.length) {
      throw createError({ statusCode: 400, message: "请填写要刷新的 URL" });
    }
    // EdgeOne 的精确 URL 必须带协议，否则任务会被判非法目标
    const invalid = list.filter(url => !/^https?:\/\//i.test(url));
    if (invalid.length) {
      throw createError({ statusCode: 400, message: `URL 必须以 http:// 或 https:// 开头：${invalid[0]}` });
    }
    return runCdnPurge(provider, () => provider.purgeUrls(list), { 来源: "后台手动", 路由: `URL×${list.length}` });
  }

  if (action === "routes") {
    const list = toStringList(routes);
    if (!list.length) {
      throw createError({ statusCode: 400, message: "请选择要刷新的页面" });
    }
    return runCdnPurge(provider, () => provider.purgeRoutes(list), { 来源: "后台手动", 路由: list.join(",") });
  }

  if (action === "zone") {
    if (!provider.purgeAll) {
      throw createError({ statusCode: 400, message: `${provider.name} 不支持整站刷新` });
    }
    return runCdnPurge(provider, () => provider.purgeAll!(), { 来源: "后台手动", 路由: "(整站)" });
  }

  if (action === "status") {
    const id = jobId?.trim();
    if (!id) {
      throw createError({ statusCode: 400, message: "缺少任务号" });
    }
    if (!provider.describeTask) {
      throw createError({ statusCode: 400, message: `${provider.name} 不支持查询任务状态` });
    }
    const task = await provider.describeTask(id);
    // 状态查询不是刷新，单独一行便于和刷新记录区分
    log.cache("CDN 刷新状态", {
      provider: provider.name,
      任务号: id,
      状态: task.status,
      说明: task.failMessage,
    });
    const result: CdnPurgeResult = {
      provider: provider.name,
      success: true,
      requested: 0,
      taskId: id,
      status: task.status,
      note: task.failMessage,
    };
    return result;
  }

  if (action === "all") {
    // 全站页面：按根目录前缀刷，比 purge_all 省配额
    return runCdnPurge(provider, () => provider.purgeRoutes([]), { 来源: "后台手动", 路由: "(全站页面)" });
  }

  log.error("[cache/cdn-purge] 未知操作类型", { action });
  throw createError({ statusCode: 400, message: "未知的操作类型" });
}

/** 请求体里的数组参数做运行时校验：非字符串元素直接丢弃（readBody 无类型保证） */
function toStringList(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  return value.filter((item): item is string => typeof item === "string").map(item => item.trim()).filter(Boolean);
}
