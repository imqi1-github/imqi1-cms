export type CacheClearAction = "all" | "preset" | "keyword" | "search" | "footprint" | "index";

export interface CacheClearBody {
  csrfToken: string;
  action: CacheClearAction;
  value?: string;
}

export interface CacheClearResponse {
  success: boolean;
  matched: number;
  cleared: number;
  message?: string;
  note?: string;
}

/** CDN 刷新操作：all = 全站页面，routes = 指定路由，urls = 指定 URL，zone = 整站刷新，status = 查任务状态 */
export type CdnPurgeAction = "all" | "routes" | "urls" | "zone" | "status";

export interface CdnPurgeBody {
  csrfToken: string;
  action: CdnPurgeAction;
  /** action=routes：站内路由（Nitro 匹配串，如 /content/**） */
  routes?: string[];
  /** action=urls：完整 URL 列表 */
  urls?: string[];
  /** action=status：要查询的刷新任务号 */
  jobId?: string;
}

export interface CdnPurgeResponse {
  success: boolean;
  provider?: string;
  requested: number;
  taskId?: string;
  /** action=status 时的任务状态 */
  status?: string;
  message?: string;
  note?: string;
}

/** 某类刷新的额度：套餐按天计 */
export interface CdnQuotaBucket {
  batch: number;
  daily: number;
  dailyAvailable: number;
}

/** 各刷新类型的额度 */
export interface CdnQuotaInfo {
  url: CdnQuotaBucket | null;
  prefix: CdnQuotaBucket | null;
  all: CdnQuotaBucket | null;
}

/** GET /api/admin/cache/status：判断哪些功能当前可用 */
export interface CacheStatusResponse {
  redis: { configured: boolean };
  cdn: {
    enabled: boolean;
    provider: string | null;
    disabledByEnv: boolean;
    quotaExhausted: boolean;
    quota: CdnQuotaInfo | null;
  };
}
