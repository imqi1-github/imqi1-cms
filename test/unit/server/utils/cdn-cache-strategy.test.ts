// 页面缓存策略：源站缓存层（文件/Redis）+ 长边缘 TTL + 写库自动刷新。
import { readFileSync } from "node:fs";

import { afterEach, describe, expect, test } from "bun:test";

import { isAutoPurgeEnabled } from "#server/utils/cdn";

const ORIGINAL = process.env.CDN_AUTO_PURGE;

afterEach(() => {
  if (ORIGINAL === undefined) Reflect.deleteProperty(process.env, "CDN_AUTO_PURGE");
  else process.env.CDN_AUTO_PURGE = ORIGINAL;
});

describe("自动刷新开关", () => {
  test("默认开启（写库后精确 URL 刷新，一次编辑只花少量 URL 额度）", () => {
    Reflect.deleteProperty(process.env, "CDN_AUTO_PURGE");
    expect(isAutoPurgeEnabled()).toBe(true);
  });

  test("CDN_AUTO_PURGE=0 / false 关闭", () => {
    for (const v of ["0", "false", "FALSE"]) {
      process.env.CDN_AUTO_PURGE = v;
      expect(isAutoPurgeEnabled()).toBe(false);
    }
  });

  test("其他取值（含空串、1、true）都算开启", () => {
    for (const v of ["", "1", "true", "yes"]) {
      process.env.CDN_AUTO_PURGE = v;
      expect(isAutoPurgeEnabled()).toBe(true);
    }
  });
});

describe("nuxt.config 的页面缓存规则", () => {
  const config = readFileSync("nuxt.config.ts", "utf8");

  test("没配 Redis 时用文件缓存（base: cache），不依赖任何外部组件", () => {
    expect(config).toContain('base: "cache"');
  });

  test("源站缓存用长时长（build.pageCacheSeconds），边缘按页面类型分档", () => {
    expect(config).toContain("siteConfig.build.pageCacheSeconds");
    expect(config).toContain("siteConfig.build.edgeCacheSeconds");
    expect(config).toContain("maxAge: PAGE_CACHE_SECONDS");
    // 列表/统计页：边缘 TTL 短（listPageCacheSeconds），源站缓存仍是长的
    expect(config).toContain("siteConfig.build.listPageCacheSeconds");
    // 档位判定与运行时共用同一份实现（shared/cache-routes），避免两套逻辑分叉
    expect(config).toContain("isListPageRoutePattern(path)");
  });

  test("敏感路径一律 no-store，绝不进边缘缓存", () => {
    for (const path of ["/login", "/admin/**", "/api/auth/**", "/api/admin/**"]) {
      const idx = config.indexOf(`"${path}"`);
      expect(idx, `routeRules 缺少 ${path}`).toBeGreaterThan(-1);
      expect(config.slice(idx, idx + 220)).toContain('"Cache-Control": "no-store"');
    }
  });

  test("搜索页的源站缓存只用 Redis：文件驱动无 TTL，而 q 是自由输入 ⇒ 键空间无界", () => {
    const idx = config.indexOf('"/search"');
    expect(idx, "routeRules 缺少 /search").toBeGreaterThan(-1);
    const block = config.slice(idx, idx + 600);
    expect(block).toContain('base: "redis"');
    expect(block, "搜索页不能回落文件驱动（无 TTL + 键空间无界）").not.toContain('base: "cache"');
  });

  test("搜索页进边缘缓存但 TTL 单独一档（写库后无法按 q 枚举失效，只能靠 TTL 收敛）", () => {
    const idx = config.indexOf('"/search"');
    const block = config.slice(idx, idx + 600);
    expect(block).toContain("siteConfig.build.searchCacheSeconds");
    expect(block, "搜索页不能下发 no-store（那会绕开边缘缓存）").not.toContain('"Cache-Control": "no-store"');
  });

  test("搜索接口不再 no-store（结果页改客户端拉，接口要能进边缘缓存）", () => {
    expect(config).not.toMatch(/"\/api\/search":\s*\{[^}]*no-store/);
  });
});
