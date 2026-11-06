/**
 * SSR HTML 必须与登录态无关（CDN 边缘缓存的前提）。
 *
 * 页面缓存已交给 CDN 边缘：边缘把**同一份 HTML** 发给所有访客。一旦登录态被渲染进 SSR，
 * 就会把 A 的「前往后台」页面发给 B。现状是安全的（登录态 UI 全在 <ClientOnly> 里、
 * SSR 阶段 isLoggedIn 恒 false、前端零 useCookie），这里用源码字面量守住这个前提。
 *
 * 真 SSR 对比在 test/e2e/ssr-user-independence.spec.ts（要起 dev server）；
 * 本文件是秒级静态守卫，挡住最可能的手滑回归。
 */
import { readdirSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";

import { describe, expect, test } from "bun:test";

import { isCdnCachedPage, significantQueryParams } from "#shared/cache-routes";

/** 递归收集 app/ 下的 .vue / .ts 源码 */
function collectAppSources(dir: string, out: string[] = []): string[] {
  for (const entry of readdirSync(dir)) {
    const full = join(dir, entry);
    if (statSync(full).isDirectory()) {
      collectAppSources(full, out);
    } else if (/\.(vue|ts)$/.test(entry)) {
      out.push(full);
    }
  }
  return out;
}

const appFiles = collectAppSources("app");

describe("SSR 与登录态无关（CDN 边缘缓存前提）", () => {
  test("app/ 前端零 useCookie：SSR 不读会话 cookie", () => {
    const hits: string[] = [];
    for (const file of appFiles) {
      const src = readFileSync(file, "utf8");
      if (src.includes("useCookie(")) hits.push(file);
    }
    expect(hits).toEqual([]);
  });

  test("app/ 不用 SSR 侧拉取 auth/verify（登录态校验只能客户端做）", () => {
    const hits: string[] = [];
    for (const file of appFiles) {
      const src = readFileSync(file, "utf8");
      // useFetch/useAsyncData 拉 auth/verify → SSR 会把用户态渲染进 HTML
      if (/use(?:Fetch|AsyncData|LazyFetch)\s*\(\s*["'`]\/api\/auth\/verify/.test(src)) hits.push(file);
    }
    expect(hits).toEqual([]);
  });

  test("useAuth 的登录态校验有 import.meta.client 门控（SSR 恒为未登录）", () => {
    const src = readFileSync("app/composables/useAuth.ts", "utf8");
    expect(/async function checkAuthStatus\(\)\s*\{\s*if \(import\.meta\.client\)/.test(src)).toBe(true);
  });

  test("登录态插件是 client-only（.client.ts 后缀）", () => {
    const plugin = readFileSync("app/plugins/auth.client.ts", "utf8");
    // 插件只提供 isLogin 转发给 useAuth（登录态事实源唯一）
    expect(plugin.includes("useAuth()")).toBe(true);
  });

  test("登录态校验在 onMounted 里发起（客户端），不参与 SSR", () => {
    const footer = readFileSync("app/components/site/SiteFooter.vue", "utf8");
    expect(/onMounted\(\(\)\s*=>\s*\{[\s\S]{0,300}checkAuthStatus\(\)/.test(footer)).toBe(true);
  });
});

describe("routeRules 的 CDN 缓存边界", () => {
  const config = readFileSync("nuxt.config.ts", "utf8");

  test("登录页与后台接口一律 no-store，绝不进边缘缓存", () => {
    for (const path of ["/login", "/admin/**", "/api/auth/**", "/api/admin/**"]) {
      const idx = config.indexOf(`"${path}"`);
      expect(idx, `routeRules 缺少 ${path} 规则`).toBeGreaterThan(-1);
      const block = config.slice(idx, idx + 220);
      expect(block, `${path} 必须显式 no-store`).toContain('"Cache-Control": "no-store"');
    }
  });

  test("页面路由下发 s-maxage（浏览器不缓存、边缘缓存）", () => {
    expect(config).toMatch(/s-maxage=\$\{edgeMaxAge\}/);
    // 边缘 TTL 按页面类型分档：内容页用 pageCacheSeconds，列表/统计页用 listPageCacheSeconds
    expect(config).toContain("siteConfig.build.pageCacheSeconds");
    expect(config).toContain("siteConfig.build.listPageCacheSeconds");
    // 档位判定必须与运行时共用同一份实现（shared/cache-routes），不能各写一套
    expect(config).toContain("isListPageRoutePattern(path)");
  });
});

describe("边缘缓存页面的 query 参数登记", () => {
  /**
   * 源站缓存键只保留「会影响 SSR 输出」的 query 参数（SIGNIFICANT_QUERY_PARAMS）。
   * 漏登记 = 同一个缓存键返回不同内容（生产真实发生过：/map 的 place 漏登记，
   * 全站标题变成「中街」）。这里用源码字面量守住：边缘缓存页读到的参数必须已登记。
   */
  test("边缘缓存页读到的 query 参数都已登记", () => {
    const hits: string[] = [];
    for (const file of collectAppSources("app/pages")) {
      const route = pageRoute(file);
      if (!isCdnCachedPage(route)) continue;
      const src = readFileSync(file, "utf8");
      const params = new Set<string>();
      for (const match of src.matchAll(/route\.query\.([A-Za-z_$][\w$]*)/g)) params.add(match[1]!);
      for (const match of src.matchAll(/route\.query\[\s*["']([A-Za-z_$][\w$]*)["']\s*\]/g)) params.add(match[1]!);
      const registered = significantQueryParams(route);
      for (const param of params) {
        if (!registered.includes(param)) hits.push(`${file} 读了未登记的 query 参数 ${param}（路由 ${route}）`);
      }
    }
    expect(hits).toEqual([]);
  });
});

/** app/pages 下的页面文件 → 路由（动态段折叠成 /**，index 段去掉） */
function pageRoute(file: string): string {
  const rel = file.replace(/\\/g, "/").replace(/^app\/pages\//, "").replace(/\.vue$/, "");
  if (rel === "index") return "/";
  const segments = rel.split("/").filter(segment => segment !== "index");
  const staticSegments = segments.filter(segment => !segment.startsWith("["));
  if (staticSegments.length !== segments.length) {
    const prefix = staticSegments.join("/");
    return prefix ? `/${prefix}/**` : "/**";
  }
  return `/${segments.join("/")}`;
}
