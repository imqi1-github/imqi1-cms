import { buildCsp } from "#server/utils/csp";
import { siteConfig } from "~~/site.config";

// 仅生产构建（含 nuxi preview）且站点配置开启 CSP 时启用。
// dev 不注入：CSP 会拦截音乐直链、地图第三方等，干扰本地开发。
const CSP_ENABLED = import.meta.env.PROD && siteConfig.security.enableCsp;

/**
 * 以 HTTP 响应头（非 <meta>）投递 CSP。
 *
 * 用 render:response：拿到的是最终完整 HTML 字符串，且该钩子只对 SSR HTML 响应触发，
 * 不会污染 /api/* 各端点自有的更严格 CSP（如登录接口的 script-src 'none'）。
 *
 * 不再注入 nonce：当前 CSP 已去掉 nonce（高德 javascript: URL 需 unsafe-inline 放行，而
 * CSP3 下 nonce 在场会使 unsafe-inline 失效），故无需再给 <script> 加 nonce 属性，直接
 * 投递响应头即可。详见 csp.ts。
 */
export default defineNitroPlugin(nitroApp => {
  if (!CSP_ENABLED) return;

  nitroApp.hooks.hook("render:response", (response, { event }) => {
    if (typeof response.body !== "string") return;

    setHeader(event, "Content-Security-Policy", buildCsp());
  });
});
