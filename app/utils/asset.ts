// 静态资源 URL helper
//
// 目的：
// - 开发环境：保持原路径，走本地 public 目录。
// - 生产环境且配置了 CDN：把白名单静态资源加上 CDN 根前缀（不带构建 hash）。
// - 未配置 CDN：保持原路径，走主域名。
//
// 注意：
// - 只有 _nuxt/ 走带 hash 的 cdnURL，由 Nuxt 自动处理；本 helper 不处理 _nuxt/。
// - 业务路由（/about、/api/...）不会被前缀。
// - 绝对资源 URL（http/https/blob/data:image）直接返回。

import { siteConfig } from "~~/site.config";
import type { PublicAssetOptions } from "~/types/asset";

const STATIC_ASSET_RE = /^\/(imgs|skills|icons|fonts|emojis|uploads)\//;

// robots.txt 不在此列：它由 Nitro 直接在主域返回（不走 CDN），
// 否则跨主机跳转会让 robots 规则只对 CDN 子域生效。
const STATIC_ASSET_FILE_RE = /^\/(favicon\.ico|manifest\.webmanifest)$/;

const ABSOLUTE_RE = /^(https?:)?\/\//i;
const SAFE_DATA_RE = /^data:image\//i;
const BLOB_RE = /^blob:/i;
const SCHEME_RE = /^[a-z][a-z0-9+.-]*:/i;

export function publicAsset(input?: string | null, options: PublicAssetOptions = {}): string {
  if (!input) return "";
  if (ABSOLUTE_RE.test(input) || SAFE_DATA_RE.test(input) || BLOB_RE.test(input)) return input;
  if (SCHEME_RE.test(input)) return "";
  if (!input.startsWith("/")) return input;
  if (options.raw) return input;
  if (input.startsWith("/_nuxt/")) return input;

  const isStatic = STATIC_ASSET_RE.test(input) || STATIC_ASSET_FILE_RE.test(input);
  if (!isStatic) return input;

  // 直接读 siteConfig.cdnUrl（不再经 runtimeConfig.public.cdnBase）。
  // CDN 根与 nuxt.config 的 cdnBase 同值；|| "" 兜底保持「未配置 CDN」时返回原路径。
  const cdnBase = siteConfig.cdnUrl || "";

  if (!cdnBase) return input;
  if (!import.meta.env?.PROD) return input;

  return `${cdnBase.replace(/\/$/, "")}${input}`;
}
