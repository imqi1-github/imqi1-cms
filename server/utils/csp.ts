import { siteConfig } from "~~/site.config";

// CSP 中使用的 CDN 源：未配置有效 http(s) 前缀时回退为空字符串，
// 避免拼出字面量 "undefined" 使对应指令失效
const cdnSrc =
  siteConfig.cdnUrl && siteConfig.cdnUrl.startsWith("http") ? siteConfig.cdnUrl : "";

/** 把指令名与一组来源拼成单条指令，过滤掉空来源（CDN 未配置时） */
function dir(name: string, ...sources: string[]): string {
  return [name, ...sources.filter(Boolean)].join(" ");
}

/**
 * 构建 Content-Security-Policy 响应头值。
 *
 * script-src 设计要点：
 * - 不用 nonce。曾长期用 nonce + strict-dynamic：nonce 精确放行内联脚本、strict-dynamic
 *   传播到高德动态加载的子脚本。但高德运行时 SDK 内部用 javascript: URL（watchSize），
 *   该 URL 的放行只能靠 'unsafe-inline' 或 'unsafe-hashes'；而 CSP3 规定：script-src 中只要
 *   存在 nonce 或 hash，'unsafe-inline' 就会被整体忽略——于是 nonce 在场时 javascript: URL
 *   始终被拦，console 会留一条非致命报错。那个 URL 内容在 SDK 内部且不固定，无法用
 *   unsafe-hashes 的 sha256 精确放行。为消除该报错（站点要求 console 干净），改去掉 nonce。
 * - 去掉 nonce 后必须同时去掉 strict-dynamic：strict-dynamic 的传播依赖一个带 nonce/hash 的
 *   "锚脚本"，没有锚点时它会忽略 host 白名单，而 Nuxt 入口 <script src=/_nuxt/entry.js> 是
 *   HTML 里写死的（parser-inserted）、无 nonce，会被拦导致整站起不来。
 * - 故 script-src = 'unsafe-inline' 'unsafe-eval' 'self' https:：
 *   'unsafe-inline' 放行 Nuxt 水合 payload 内联脚本与高德 javascript: URL；
 *   'self' 放行 _nuxt 入口与各 modulepreload；
 *   'https:' 放行高德动态域名（webapi.amap.com / WebGLRender 插件 CDN 等，逐个枚举易漏）；
 *   'unsafe-eval' 放行高德运行时 SDK 的 eval 拼装（自研与打包依赖均无 eval）。
 * - 失去 nonce 后，注入面扩到"内联脚本注入"。本站评论/搜索等 XSS 输出已转义 + DOMPurify
 *   收敛，且 'unsafe-eval' 本就是更大开口，边际风险可控；'object-src' 'none' 仍堵插件注入。
 * - style: 留 'unsafe-inline'：Nuxt SSR 直出大量内联 scoped <style> 与 style 属性，
 *   全量 nonce 化需改构建管线；纯样式注入危害远低于脚本执行。
 * - 其余收紧：media-src 去掉 http:（混合内容）、frame-ancestors 'none'（与
 *   X-Frame-Options: DENY 对齐，防点击劫持）。
 */
export function buildCsp(): string {
  return [
    `default-src 'self'`,
    `script-src 'unsafe-inline' 'unsafe-eval' 'self' https:`,
    dir("style-src", "'self'", "'unsafe-inline'", cdnSrc),
    dir("worker-src", "'self'", "blob:"),
    dir("img-src", "'self'", "data:", "https:", "blob:", cdnSrc),
    dir("font-src", "'self'", "data:", cdnSrc),
    dir("manifest-src", "'self'", cdnSrc),
    dir("media-src", "'self'", "https:", "data:", "blob:"),
    dir(
      "connect-src",
      "'self'",
      cdnSrc,
      "https://api.github.com",
      "https://gitee.com",
      "https://*.amap.com",
      "blob:",
    ),
    `object-src 'none'`,
    `base-uri 'self'`,
    `form-action 'self'`,
    `frame-ancestors 'none'`,
  ].join("; ");
}
