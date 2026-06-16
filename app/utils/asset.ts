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

const STATIC_ASSET_RE =
  /^\/(imgs|skills|icons|fonts|emojis|uploads)\//;

const STATIC_ASSET_FILE_RE =
  /^\/(favicon\.ico|manifest\.webmanifest|robots\.txt|sitemap\.xsl)$/;

const ABSOLUTE_RE = /^(https?:)?\/\//i;
const SAFE_DATA_RE = /^data:image\//i;
const BLOB_RE = /^blob:/i;
const SCHEME_RE = /^[a-z][a-z0-9+.-]*:/i;

export interface PublicAssetOptions {
  /** 强制返回原始路径，不加 CDN 前缀 */
  raw?: boolean;
}

export function publicAsset(
  input?: string | null,
  options: PublicAssetOptions = {},
): string {
  if (!input) return "";
  if (ABSOLUTE_RE.test(input) || SAFE_DATA_RE.test(input) || BLOB_RE.test(input)) return input;
  if (SCHEME_RE.test(input)) return "";
  if (!input.startsWith("/")) return input;
  if (options.raw) return input;
  if (input.startsWith("/_nuxt/")) return input;

  const isStatic =
    STATIC_ASSET_RE.test(input) || STATIC_ASSET_FILE_RE.test(input);
  if (!isStatic) return input;

  let cdnBase = "";
  try {
    const config = useRuntimeConfig();
    cdnBase = (config.public.cdnBase as string | undefined) || "";
  } catch {
    // 在无法访问 Nuxt 运行时上下文的位置调用时，回退到原路径。
    return input;
  }

  if (!cdnBase) return input;
  if (!import.meta.env?.PROD) return input;

  return `${cdnBase.replace(/\/$/, "")}${input}`;
}
