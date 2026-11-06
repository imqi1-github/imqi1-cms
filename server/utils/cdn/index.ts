/**
 * CDN 刷新入口
 *
 * 环境变量按「厂商专属用 EDGEONE_ 前缀（对齐 COS_ 的命名模式）、与厂商无关的用 CDN_ 前缀」：
 *   厂商专属（EdgeOne）
 *   EDGEONE_ZONE_ID              EdgeOne 站点 ID（形如 zone-xxxxxxxx）
 *   EDGEONE_SECRET_ID/KEY        腾讯云 API 密钥（与 COS_SECRET_ID 同账号时可填同一对）
 *   EDGEONE_REGION               可选，EdgeOne 地域，如 ap-guangzhou
 *   EDGEONE_API_HOST             可选，国际站填 teo.intl.tencentcloudapi.com
 *   与厂商无关
 *   CDN_PROVIDER                 选哪家 CDN（edgeone；缺省按下面的 ZoneId+密钥自动识别）
 *   CDN_PURGE_BASE_URL           可选，覆盖 site.config 的 site.url（刷新用的主机）
 *   CDN_PURGE_BATCH_SIZE         可选，单次提交条数（默认按套餐的单次上限实时读）
 *   CDN_PURGE_SCOPE              可选，route=按路由精确刷（默认）；site=合并成根目录一条（省额度、多回源）
 *
 * 新增一家 CDN 只需在这里注册实现。未配置时 createCdnProvider() 返回 null，调用方整段跳过。
 */


import { EdgeOneCdnProvider } from "./edgeone";

import type { CdnProvider, CdnPurgeResult } from "#server/types/utils/cdn";
import { log } from "#server/utils/log";

function envStr(name: string): string {
  return (process.env[name] || "").trim();
}

function envNum(name: string): number | undefined {
  const raw = envStr(name);
  if (!raw) return undefined;
  const value = Number(raw);
  return Number.isFinite(value) ? value : undefined;
}

/**
 * 开发环境恒不启用 CDN 刷新（与「开发恒不启用 Redis」同口径）。
 *
 * 不加这道闸的话，本地 .env 里配了 ZoneId/密钥时，**每次写库都会真调 EdgeOne 刷生产站**——
 * 白烧刷新额度，还可能把线上页面刷成旧内容（本地数据与线上不同）。
 */
export function isCdnDisabledByEnv(): boolean {
  return process.env.NODE_ENV === "development";
}

/**
 * 写库后自动刷新边缘缓存：默认开启，CDN_AUTO_PURGE=0 关闭。
 *
 * 刷新前做了 5 秒防抖 + 精确 URL 展开，一次编辑会话只消耗少量 URL 额度；
 * 后台手动刷新与 MCP 的 target=cdn 不受此开关限制（那是明确的人工动作）。
 */
export function isAutoPurgeEnabled(): boolean {
  const raw = (process.env.CDN_AUTO_PURGE || "").trim().toLowerCase();
  return raw !== "0" && raw !== "false";
}

/**
 * 启动时是否需要刷边缘缓存：构建变了才刷
 *
 * 旧 HTML 引用 `static/<buildHash>` 的静态资源，换构建后资源可能已被清理；
 * 但每次重启都刷会白烧额度（重启一天可能好几次），故用 buildHash 做去重。
 */
export function shouldResetEdgeCache(lastBuildHash: string | null | undefined, buildHash: string): boolean {
  if (!buildHash) return false;
  return lastBuildHash !== buildHash;
}

/** 构造当前配置的 provider；未启用返回 null */
export function createCdnProvider(): CdnProvider | null {
  if (isCdnDisabledByEnv()) return null;

  const zoneId = envStr("EDGEONE_ZONE_ID");
  const secretId = envStr("EDGEONE_SECRET_ID");
  const secretKey = envStr("EDGEONE_SECRET_KEY");

  const name = (envStr("CDN_PROVIDER") || (zoneId && secretId && secretKey ? "edgeone" : "none")).toLowerCase();
  if (name === "none") return null;

  if (name === "edgeone") {
    const scope = envStr("CDN_PURGE_SCOPE").toLowerCase();
    return new EdgeOneCdnProvider(
      {
        zoneId,
        secretId,
        secretKey,
        region: envStr("EDGEONE_REGION") || undefined,
        host: envStr("EDGEONE_API_HOST") || undefined,
        batchSize: envNum("CDN_PURGE_BATCH_SIZE"),
      },
      {
        baseUrl: envStr("CDN_PURGE_BASE_URL") || undefined,
        purgeScope: scope === "site" ? "site" : "route",
      },
    );
  }

  log.error(`[cdn] 未知的 CDN_PROVIDER=${name}，已跳过刷新`);
  return null;
}

/** 是否启用了 CDN 刷新 */
export function isCdnEnabled(): boolean {
  return createCdnProvider()?.isEnabled() ?? false;
}

/**
 * 刷新额度耗尽的熔断状态。
 *
 * CDN 套餐的刷新额度是按天的，用尽后继续提交只会一直报错。此时当天不再尝试刷新，
 * 内容靠边缘缓存 TTL 自然更新（见 site.config build.listPageCacheSeconds）。
 */
let quotaExhaustedDay = "";

/** 今天的日期键（额度按天计，跨天要复位） */
function todayKey(): string {
  return new Date().toISOString().slice(0, 10);
}

/** 额度是否已耗尽（当天不再尝试刷新） */
export function isCdnQuotaExhausted(): boolean {
  if (!quotaExhaustedDay) return false;
  if (quotaExhaustedDay !== todayKey()) {
    quotaExhaustedDay = "";
    return false;
  }
  return true;
}

/** 额度耗尽时记下状态并只警告一次 */
function markQuotaExhausted(error: string): void {
  if (quotaExhaustedDay === todayKey()) return;
  quotaExhaustedDay = todayKey();
  log.error("[cdn] 刷新额度已耗尽，当天不再自动刷新；内容将在边缘缓存 TTL 到期后自动更新", { error });
}

/** 未配置 CDN 时只告警一次：否则忘配密钥会全程静默，内容不即时更新也没人知道 */
let notConfiguredWarned = false;

/** 未配置 CDN 刷新时的告警（自动刷新路径也要调，否则忘配密钥会全程静默） */
export function warnCdnNotConfigured(): void {
  warnNotConfigured();
}

function warnNotConfigured(): void {
  if (notConfiguredWarned || isCdnDisabledByEnv()) return;
  notConfiguredWarned = true;
  log.error(
    "[cdn] 未启用 CDN 刷新：内容变更后不会立即从边缘缓存失效（缺 EDGEONE_ZONE_ID / EDGEONE_SECRET_ID / EDGEONE_SECRET_KEY，或 CDN_PROVIDER=none）",
    {},
  );
}

/**
 * 执行刷新并记缓存日志（自动刷新与后台手动刷新共用，日志口径一致）
 *
 * @param provider 已构造好的 provider
 * @param run 具体的刷新动作
 * @param meta 日志附加信息（来源、路由）
 */
export async function runCdnPurge(
  provider: CdnProvider,
  run: () => Promise<CdnPurgeResult>,
  meta: { 来源: string; 路由?: string },
): Promise<CdnPurgeResult> {
  const result = await run();
  if (!result.success && result.error?.includes("LimitExceeded.DailyQuota")) {
    markQuotaExhausted(result.error);
  }
  log.cache("CDN 刷新", {
    provider: provider.name,
    来源: meta.来源,
    路由: meta.路由,
    目标数: result.requested,
    结果: result.success ? "成功" : `失败 ${result.error ?? ""}`,
    任务号: result.taskId,
    状态: result.status,
  });
  return result;
}

/**
 * 按站内路由刷新（写库后调用）
 *
 * 路由用 shared/constants.ts 里那组失效路由常量（Nitro 匹配串，如 `/content/**`）。
 * 未启用 CDN 时返回 null；失败只记日志不抛——刷新失败不该影响写库。
 *
 * @param routes 路由列表；空/缺省 = 全站页面（根目录前缀）
 * @param source 日志来源标记（自动刷新 / 人工触发），用于事后归因额度
 */
export async function purgeCdnRoutes(routes?: string[], source = "自动"): Promise<CdnPurgeResult | null> {
  const provider = createCdnProvider();
  if (!provider?.isEnabled()) {
    warnNotConfigured();
    return null;
  }
  if (isCdnQuotaExhausted()) return null;

  try {
    return await runCdnPurge(provider, () => provider.purgeRoutes(routes ?? []), {
      来源: source,
      路由: routes?.length ? routes.join(",") : "(全站)",
    });
  } catch (error) {
    log.error("[cdn] 刷新失败", { error });
    return null;
  }
}

/** 按精确 URL 列表刷新（默认来源=自动，与 purgeCdnRoutes 同口径；后台/MCP 会显式传来源） */
export async function purgeCdnUrls(urls: string[], source = "自动"): Promise<CdnPurgeResult | null> {
  const provider = createCdnProvider();
  if (!provider?.isEnabled()) {
    warnNotConfigured();
    return null;
  }

  try {
    return await runCdnPurge(provider, () => provider.purgeUrls(urls), { 来源: source });
  } catch (error) {
    log.error("[cdn] 刷新失败", { error });
    return null;
  }
}

