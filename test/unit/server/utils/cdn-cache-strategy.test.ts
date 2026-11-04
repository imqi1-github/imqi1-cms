// 页面缓存策略：源站缓存层（文件/Redis）+ 边缘缓存 + ETag；自动刷新默认关闭。
import { readFileSync } from "node:fs";

import { afterEach, describe, expect, test } from "bun:test";

import { isAutoPurgeEnabled } from "#server/utils/cdn";

const ORIGINAL = process.env.CDN_AUTO_PURGE;

afterEach(() => {
  if (ORIGINAL === undefined) Reflect.deleteProperty(process.env, "CDN_AUTO_PURGE");
  else process.env.CDN_AUTO_PURGE = ORIGINAL;
});

describe("自动刷新开关", () => {
  test("默认关闭（内容靠 TTL + 缓存预刷新收敛，不消耗刷新额度）", () => {
    Reflect.deleteProperty(process.env, "CDN_AUTO_PURGE");
    expect(isAutoPurgeEnabled()).toBe(false);
  });

  test("显式设为 1 才开", () => {
    process.env.CDN_AUTO_PURGE = "1";
    expect(isAutoPurgeEnabled()).toBe(true);
  });

  test("其他取值都算关", () => {
    for (const v of ["", "0", "true", "yes"]) {
      process.env.CDN_AUTO_PURGE = v;
      expect(isAutoPurgeEnabled()).toBe(false);
    }
  });
});

describe("nuxt.config 的页面缓存规则", () => {
  const config = readFileSync("nuxt.config.ts", "utf8");

  test("没配 Redis 时用文件缓存（base: cache），不依赖任何外部组件", () => {
    expect(config).toContain('base: "cache"');
  });

  test("源站与边缘用同一个时长（build.pageCacheSeconds）", () => {
    expect(config).toContain("siteConfig.build.pageCacheSeconds");
    expect(config).toContain("maxAge: PAGE_CACHE_SECONDS");
    expect(config).toContain("s-maxage=${PAGE_CACHE_SECONDS}");
  });

  test("敏感路径一律 no-store，绝不进边缘缓存", () => {
    for (const path of ["/login", "/admin/**", "/api/auth/**", "/api/admin/**"]) {
      const idx = config.indexOf(`"${path}"`);
      expect(idx, `routeRules 缺少 ${path}`).toBeGreaterThan(-1);
      expect(config.slice(idx, idx + 220)).toContain('"Cache-Control": "no-store"');
    }
  });
});
