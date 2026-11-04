// CDN 刷新（server/utils/cdn）的类型（规则4：类型独立文件）。

/** 刷新语义：purge = 只删边缘缓存（下次回源），refresh = 删缓存并强制回源重新生成 */
export type CdnPurgeMode = "purge" | "refresh";

/** 刷新请求的可选参数 */
export interface CdnPurgeOptions {
  /** 刷新语义，默认 purge */
  mode?: CdnPurgeMode;
}

/** 一次刷新提交的结果 */
export interface CdnPurgeResult {
  /** provider 名（日志与后台展示用） */
  provider: string;
  /** 是否成功提交 */
  success: boolean;
  /** 本次提交的目标数量（URL + 目录 + 主机） */
  requested: number;
  /** 服务端返回的刷新任务 ID：异步刷新型 CDN 用它查状态 */
  taskId?: string;
  /** 刷新任务状态（查询任务时返回）：processing / success / failed / timeout / canceled */
  status?: string;
  /** 失败原因（success 为 false 时有值） */
  error?: string;
  /** 补充说明（成功时的提示） */
  note?: string;
  /** 服务端原始响应，便于排查 */
  raw?: unknown;
}

/**
 * CDN 刷新 provider 接口
 *
 * 未配置密钥时 `isEnabled()` 返回 false，调用方据此整段跳过，不报错。
 */
export interface CdnProvider {
  /** provider 标识（日志/后台展示用） */
  readonly name: string;
  /** 是否已配置可用 */
  isEnabled(): boolean;
  /** 按 URL 刷新（必实现） */
  purgeUrls(urls: string[], opts?: CdnPurgeOptions): Promise<CdnPurgeResult>;
  /**
   * 按站内路由刷新（父类提供：路由 → 刷新目标的转换）
   *
   * 路由是 Nitro 匹配串，如 `/content/**`；通配路由会转成目录前缀（各家 CDN 能力不同）。
   */
  purgeRoutes(routes: string[], opts?: CdnPurgeOptions): Promise<CdnPurgeResult>;
  /** 按目录刷新：部分 CDN 无此能力，基类默认返回「不支持」 */
  purgeDirectories?(directories: string[], opts?: CdnPurgeOptions): Promise<CdnPurgeResult>;
  /** 按 Host 刷新：部分 CDN 无此能力，基类默认返回「不支持」 */
  purgeHosts?(hosts: string[], opts?: CdnPurgeOptions): Promise<CdnPurgeResult>;
  /** 整站刷新：配额消耗大，部分 CDN 无此能力 */
  purgeAll?(opts?: CdnPurgeOptions): Promise<CdnPurgeResult>;
  /** 查询刷新任务状态：异步刷新型 CDN 用它确认是否已生效 */
  describeTask?(jobId: string): Promise<{ status?: string; failMessage?: string }>;
  /** 查询刷新额度剩余：套餐按天计，额度用尽后当天刷新全部失败 */
  describeQuota?(): Promise<CdnQuotaInfo | null>;
}

/** 某类刷新的额度：套餐按天计 */
export interface CdnQuotaBucket {
  /** 单次提交上限（条） */
  batch: number;
  /** 每日上限（条） */
  daily: number;
  /** 今日剩余（条） */
  dailyAvailable: number;
}

/** 各刷新类型的额度（不同套餐差异很大，目录刷新通常比 URL 刷新紧得多） */
export interface CdnQuotaInfo {
  /** 精确 URL 刷新额度 */
  url: CdnQuotaBucket | null;
  /** 目录刷新额度 */
  prefix: CdnQuotaBucket | null;
  /** 整站刷新额度 */
  all: CdnQuotaBucket | null;
}

/** 刷新目标类型：精确 URL 或目录前缀 */
export type CdnPurgeTargetKind = "url" | "prefix";

/** 刷新目标：URL 形态的资源地址（精确页带完整路径，目录前缀带结尾斜杠） */
export interface CdnPurgeTarget {
  kind: CdnPurgeTargetKind;
  value: string;
}
