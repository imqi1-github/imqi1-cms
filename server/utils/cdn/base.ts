/**
 * CDN provider 公共父类
 *
 * 新接一家 CDN 时继承本类：实现 `purgeUrls`（必填）与 `isEnabled`，其余能力（路由→目标转换、
 * 目录/Host 刷新的兜底、多结果合并）由父类提供，业务侧调用方式保持不变。
 */


import { routesToPurgeTargets } from "./route-url";

import type { CdnProvider, CdnPurgeOptions, CdnPurgeResult, CdnPurgeTarget } from "#server/types/utils/cdn";
import { siteConfig } from "~~/site.config";

export interface CdnProviderOptions {
  /** 站点对外地址：把站内路由映射成完整 URL，默认取 site.config 的 site.url */
  baseUrl?: string;
  /**
   * 刷新范围：route = 按路由精确刷（省回源、费目录额度）；site = 合并成根目录一条（省额度、多回源）
   */
  purgeScope?: "route" | "site";
}

/** 合并多次刷新的结果（URL 刷新 + 目录刷新可能各提交一次） */
export function mergePurgeResults(provider: string, results: CdnPurgeResult[]): CdnPurgeResult {
  const merged: CdnPurgeResult = {
    provider,
    success: results.every(r => r.success),
    requested: results.reduce((sum, r) => sum + r.requested, 0),
  };
  const failed = results.find(r => !r.success);
  if (failed?.error) merged.error = failed.error;
  const jobId = results.find(r => r.taskId)?.taskId;
  if (jobId) merged.taskId = jobId;
  const note = results.find(r => r.note)?.note;
  if (note) merged.note = note;
  return merged;
}

export abstract class CdnProviderBase implements CdnProvider {
  /** provider 标识 */
  abstract readonly name: string;
  /** 站点对外地址（无末尾斜杠） */
  readonly baseUrl: string;
  /** 刷新范围：route=按路由精确刷；site=合并成根目录一条（省额度） */
  readonly purgeScope: "route" | "site";

  constructor(options: CdnProviderOptions = {}) {
    this.baseUrl = (options.baseUrl || siteConfig.site.url).replace(/\/+$/, "");
    this.purgeScope = options.purgeScope ?? "route";
  }

  /** 是否已配置可用 */
  abstract isEnabled(): boolean;

  /** 按 URL 刷新（各家差异最大的部分，必实现） */
  abstract purgeUrls(urls: string[], opts?: CdnPurgeOptions): Promise<CdnPurgeResult>;

  /** 按目录刷新：默认不支持，需要的 CDN 覆写 */
  purgeDirectories(directories: string[], _opts?: CdnPurgeOptions): Promise<CdnPurgeResult> {
    return Promise.resolve({
      provider: this.name,
      success: false,
      requested: directories.length,
      error: `${this.name} 不支持目录刷新`,
    });
  }

  /** 按 Host 刷新：默认不支持，需要的 CDN 覆写 */
  purgeHosts(hosts: string[], _opts?: CdnPurgeOptions): Promise<CdnPurgeResult> {
    return Promise.resolve({
      provider: this.name,
      success: false,
      requested: hosts.length,
      error: `${this.name} 不支持 Host 刷新`,
    });
  }

  /** 站内路由 → 刷新目标（精确页给 URL，通配页给目录前缀） */
  protected toTargets(routes: string[]): CdnPurgeTarget[] {
    return routesToPurgeTargets(routes, this.baseUrl, this.purgeScope);
  }

  /**
   * 按站内路由刷新（业务侧最常用入口）
   *
   * 路由是 Nitro 匹配串（`/content/**`）：URL 类交给 `purgeUrls`，目录类交给 `purgeDirectories`。
   */
  async purgeRoutes(routes: string[], opts?: CdnPurgeOptions): Promise<CdnPurgeResult> {
    const targets = this.toTargets(routes);
    const urls = targets.filter(t => t.kind === "url").map(t => t.value);
    const prefixes = targets.filter(t => t.kind === "prefix").map(t => t.value);

    const results: CdnPurgeResult[] = [];
    if (urls.length) results.push(await this.purgeUrls(urls, opts));
    if (prefixes.length) results.push(await this.purgeDirectories(prefixes, opts));
    if (!results.length) {
      return { provider: this.name, success: true, requested: 0, note: "没有需要刷新的目标" };
    }
    return mergePurgeResults(this.name, results);
  }
}
