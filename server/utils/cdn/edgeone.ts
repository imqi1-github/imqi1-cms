/**
 * 腾讯云 EdgeOne 刷新实现
 *
 * EdgeOne 的内容管理只有一个建任务接口 `CreatePurgeTask`，用 `Type` 区分刷新方式：
 *   purge_url    精确 URL（必须带协议，**不支持通配符**）
 *   purge_prefix 目录前缀（带协议 + 结尾斜杠）
 *   purge_host   主机名（不带协议，不支持通配符）
 *   purge_all    整站刷新（配额消耗大）
 * 任务号字段是 `JobId`（不是 TaskId），状态用 `DescribePurgeTasks` 查。
 * 文档：https://cloud.tencent.com/document/api/1552/80703
 */

import { CdnProviderBase, type CdnProviderOptions } from "./base";
import { signTencentCloudRequest } from "./tencent-signature";

import type { CdnPurgeOptions, CdnPurgeResult, CdnQuotaBucket, CdnQuotaInfo } from "#server/types/utils/cdn";

const SERVICE = "teo";
const VERSION = "2022-09-01";
const DEFAULT_HOST = "teo.tencentcloudapi.com";
/** 单次提交条数：按最保守套餐（免费版目录刷新 50 条/次）取值 */
const DEFAULT_BATCH_SIZE = 50;
/** API 请求超时（毫秒）：避免后台手动刷新/状态查询挂住请求 */
const REQUEST_TIMEOUT_MS = 15_000;

export type EdgeOnePurgeType = "purge_url" | "purge_prefix" | "purge_host" | "purge_all";

export interface EdgeOneCdnConfig {
  /** EdgeOne 站点 ID（形如 zone-xxxxxxxx） */
  zoneId: string;
  /** 腾讯云 SecretId */
  secretId: string;
  /** 腾讯云 SecretKey */
  secretKey: string;
  /** 地域，可选（EdgeOne 是全球产品，不传也能调） */
  region?: string;
  /** API 域名，默认 teo.tencentcloudapi.com（国际站用 teo.intl.tencentcloudapi.com） */
  host?: string;
  /** 单次提交的目标条数上限，超出自动分批 */
  batchSize?: number;
}

interface EdgeOneApiResponse {
  Response?: {
    JobId?: string;
    FailedList?: ({ Reason?: string; Targets?: string[] } | null)[] | null;
    Error?: { Code?: string; Message?: string };
    RequestId?: string;
    Tasks?: ({ JobId?: string; Status?: string; FailMessage?: string } | null)[];
    PurgeQuota?: ({
      Batch?: number;
      Daily?: number;
      DailyAvailable?: number;
      Type?: string;
    } | null)[];
  };
}

/** 分批：超出单次配额就拆成多次提交 */
function chunk<T>(items: T[], size: number): T[][] {
  const out: T[][] = [];
  for (let i = 0; i < items.length; i += size) out.push(items.slice(i, i + size));
  return out;
}

/**
 * 额度快照的缓存时长（毫秒）。
 *
 * 配额按天计，但单次提交上限与当日剩余要实时读；60 秒足够，且不至于每次刷新都多打一次接口。
 */
const QUOTA_CACHE_MS = 60_000;

/** 额度快照（模块级，跨 provider 实例共享同一份，避免每个请求都打配额接口） */
let quotaSnapshot: { at: number; info: CdnQuotaInfo } | null = null;

/** 重置额度快照缓存（测试用；改了站点/套餐也应调） */
export function resetCdnQuotaCache(): void {
  quotaSnapshot = null;
}

/** 刷新类型 → 额度池（官方口径：purge_host 与 purge_prefix 共用同一个池） */
function quotaBucketFor(quota: CdnQuotaInfo, type: EdgeOnePurgeType): CdnQuotaBucket | null {
  if (type === "purge_url") return quota.url;
  if (type === "purge_all") return quota.all;
  return quota.prefix;
}

export class EdgeOneCdnProvider extends CdnProviderBase {
  readonly name = "edgeone";

  private readonly zoneId: string;
  private readonly secretId: string;
  private readonly secretKey: string;
  private readonly region?: string;
  private readonly host: string;
  private readonly batchSize: number;

  constructor(config: EdgeOneCdnConfig, options: CdnProviderOptions = {}) {
    super(options);
    this.zoneId = config.zoneId;
    this.secretId = config.secretId;
    this.secretKey = config.secretKey;
    this.region = config.region;
    this.host = config.host || DEFAULT_HOST;
    this.batchSize = Math.max(1, config.batchSize || DEFAULT_BATCH_SIZE);
  }

  isEnabled(): boolean {
    return Boolean(this.zoneId && this.secretId && this.secretKey);
  }

  /** 精确 URL 刷新 */
  override purgeUrls(urls: string[], _opts?: CdnPurgeOptions): Promise<CdnPurgeResult> {
    return this.createTask("purge_url", urls);
  }

  /** 目录刷新（Targets 带协议 + 结尾斜杠） */
  override purgeDirectories(directories: string[], _opts?: CdnPurgeOptions): Promise<CdnPurgeResult> {
    return this.createTask("purge_prefix", directories);
  }

  /** 主机刷新（Targets 只写主机名） */
  override purgeHosts(hosts: string[], _opts?: CdnPurgeOptions): Promise<CdnPurgeResult> {
    return this.createTask("purge_host", hosts);
  }

  /** 整站刷新：配额消耗大（免费版每天 10 次），只在后台手动用 */
  purgeAll(): Promise<CdnPurgeResult> {
    return this.createTask("purge_all", []);
  }

  /** 查询刷新任务状态（processing / success / failed / timeout / canceled） */
  async describeTask(jobId: string): Promise<{ status?: string; failMessage?: string }> {
    const body = await this.request("DescribePurgeTasks", {
      ZoneId: this.zoneId,
      Filters: [{ Name: "job-id", Values: [jobId] }],
    });
    const task = body.Response?.Tasks?.[0] as { Status?: string; FailMessage?: string } | undefined;
    return { status: task?.Status, failMessage: task?.FailMessage };
  }

  /**
   * 查询刷新额度剩余（套餐按天计，用尽后当天刷新全部失败）
   *
   * 额度单位是「资源条目数」：提交 3 个目录 = 扣 3 个额度，不是 1 次任务。
   * 文档：https://cloud.tencent.com/document/api/1552/80701
   */
  async describeQuota(): Promise<CdnQuotaInfo | null> {
    const body = await this.request("DescribeContentQuota", { ZoneId: this.zoneId });
    const list = body.Response?.PurgeQuota ?? [];
    const pick = (type: string) => list.find(item => item?.Type === type);
    const url = pick("purge_url");
    const prefix = pick("purge_prefix");
    const all = pick("purge_all");
    if (!url && !prefix && !all) return null;
    return {
      url: url ? { batch: url.Batch ?? 0, daily: url.Daily ?? 0, dailyAvailable: url.DailyAvailable ?? 0 } : null,
      prefix: prefix ? { batch: prefix.Batch ?? 0, daily: prefix.Daily ?? 0, dailyAvailable: prefix.DailyAvailable ?? 0 } : null,
      all: all ? { batch: all.Batch ?? 0, daily: all.Daily ?? 0, dailyAvailable: all.DailyAvailable ?? 0 } : null,
    };
  }

  /** 额度快照（带 60 秒缓存）：单次提交上限按套餐走，不写死 */
  private async quotaSnapshot(): Promise<CdnQuotaInfo | null> {
    const now = Date.now();
    if (quotaSnapshot && now - quotaSnapshot.at < QUOTA_CACHE_MS) return quotaSnapshot.info;
    try {
      const info = await this.describeQuota();
      if (info) quotaSnapshot = { at: now, info };
      return info;
    } catch {
      return null;
    }
  }

  /** 提交刷新任务（分批），返回合并结果 */
  private async createTask(type: EdgeOnePurgeType, targets: string[]): Promise<CdnPurgeResult> {
    if (!this.isEnabled()) {
      return {
        provider: this.name,
        success: false,
        requested: targets.length,
        error: "EdgeOne 未配置（缺 ZoneId 或密钥）",
      };
    }
    if (type !== "purge_all" && !targets.length) {
      return { provider: this.name, success: true, requested: 0, note: "没有需要刷新的目标" };
    }

    // 单次提交上限按套餐走（免费版目录 50、基础版 1000…），写死 50 会白拆批次
    const quota = await this.quotaSnapshot();
    const bucket = quota ? quotaBucketFor(quota, type) : null;
    const batchSize = Math.max(1, Math.min(this.batchSize, bucket?.batch ?? this.batchSize));

    // 额度预检：不够就只提交额度内的部分（整批提交会被拒，全部落空更糟）
    let submitTargets = targets;
    let truncated = 0;
    if (bucket && type !== "purge_all" && targets.length > bucket.dailyAvailable) {
      truncated = targets.length - bucket.dailyAvailable;
      submitTargets = targets.slice(0, bucket.dailyAvailable);
    }

    if (!submitTargets.length && targets.length) {
      return {
        provider: this.name,
        success: false,
        requested: targets.length,
        error: `今日刷新额度已用尽（${type === "purge_url" ? "URL" : "目录"}剩余 0），内容将在边缘缓存 TTL 到期后自动更新`,
      };
    }

    const batches = type === "purge_all" ? [[]] : chunk(submitTargets, batchSize);
    const jobIds: string[] = [];
    const failures: string[] = [];

    for (const batch of batches) {
      const payload: Record<string, unknown> = { ZoneId: this.zoneId, Type: type };
      if (batch.length) payload.Targets = batch;
      const body = await this.request("CreatePurgeTask", payload);

      const error = body.Response?.Error;
      if (error) {
        failures.push(`${error.Code ?? "UnknownError"}: ${error.Message ?? ""}`);
        continue;
      }
      const jobId = body.Response?.JobId;
      if (jobId) jobIds.push(jobId);
      const failedList = body.Response?.FailedList ?? [];
      for (const item of failedList) {
        if (!item) continue;
        failures.push(`${item.Reason ?? "Failed"}: ${(item.Targets ?? []).join(", ")}`);
      }
    }

    const notes: string[] = [];
    if (jobIds.length > 1) notes.push(`分 ${batches.length} 批提交`);
    if (truncated > 0) {
      notes.push(`今日额度不足，仅刷新 ${submitTargets.length} 个目标（${truncated} 个未提交，将由 TTL 自然更新）`);
    }

    return {
      provider: this.name,
      success: failures.length === 0,
      requested: targets.length,
      taskId: jobIds[0],
      error: failures.length ? failures.join("; ") : undefined,
      note: notes.length ? notes.join("；") : undefined,
    };
  }

  /** 统一的腾讯云 API 调用：签名 → fetch → 解析 */
  private async request(action: string, payload: Record<string, unknown>): Promise<EdgeOneApiResponse> {
    const signed = signTencentCloudRequest({
      service: SERVICE,
      version: VERSION,
      action,
      host: this.host,
      region: this.region,
      payload,
      credential: { secretId: this.secretId, secretKey: this.secretKey },
    });

    const res = await fetch(signed.url, {
      method: "POST",
      headers: signed.headers,
      body: signed.body,
      signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
    });
    const text = await res.text();
    if (!res.ok) {
      throw new Error(`EdgeOne ${action} HTTP ${res.status}: ${text.slice(0, 300)}`);
    }
    try {
      return JSON.parse(text) as EdgeOneApiResponse;
    } catch {
      throw new Error(`EdgeOne ${action} 返回非 JSON: ${text.slice(0, 300)}`);
    }
  }
}
