export type CacheClearAction = "all" | "preset" | "keyword" | "search" | "footprint";

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
  /** provider 名（edgeone 等） */
  provider?: string;
  /** 本次刷新的目标数 */
  requested: number;
  /** CDN 返回的刷新任务号，可用于查执行状态 */
  taskId?: string;
  /** action=status 时的任务状态（processing / success / failed / timeout / canceled） */
  status?: string;
  message?: string;
  note?: string;
}

/** 某类刷新的额度（资源条目数，套餐按天计） */
export interface CdnQuotaBucket {
  /** 单次提交上限 */
  batch: number;
  /** 每日上限 */
  daily: number;
  /** 今日剩余 */
  dailyAvailable: number;
}

/** 各刷新类型的额度 */
export interface CdnQuotaInfo {
  url: CdnQuotaBucket | null;
  prefix: CdnQuotaBucket | null;
  all: CdnQuotaBucket | null;
}

/** GET /api/admin/cache/status：缓存管理页判断哪些功能当前可用 */
export interface CacheStatusResponse {
  redis: {
    /** 是否配置了 Redis（未配置时相关清理入口不可用） */
    configured: boolean;
  };
  cdn: {
    /** CDN 刷新是否可用 */
    enabled: boolean;
    provider: string | null;
    /** 是否因开发环境而停用 */
    disabledByEnv: boolean;
    /** 本进程内是否已因额度耗尽而停止自动刷新 */
    quotaExhausted: boolean;
    /** 今日剩余额度（查询失败时为 null） */
    quota: CdnQuotaInfo | null;
  };
}
