import "#test/helpers/nitro-globals";

import { describe, expect, mock, test } from "bun:test";

// 假 redis:记录 SCAN 的 pattern 与 UNLINK 调用,两页游标后结束
const calls: Array<{ pattern?: string; unlinked?: number }> = [];
let scanPages: string[][] = [];
let page = 0;
const fakeRedis = {
  async scan(_cursor: string, _m: string, pattern: string, _c: string, _n: string) {
    calls.push({ pattern });
    const keys = scanPages[page] ?? [];
    page++;
    const next = page < scanPages.length ? String(page) : "0";
    return [next, keys] as const;
  },
  async unlink(...keys: string[]) {
    calls.push({ unlinked: keys.length });
    return keys.length;
  },
};
mock.module("#server/utils/redis", () => ({ redis: fakeRedis }));

const { invalidateContentCaches } = await import("#server/utils/content-cache");

describe("invalidateContentCaches", () => {
  test("redis 为 null 时 no-op(此分支由未 mock 场景保证,这里验证正常路径)", async () => {
    calls.length = 0;
    scanPages = [["k1"]];
    await invalidateContentCaches({ routes: ["/content/**"] });
    // 冒号形态(记忆:nitro:routes 键是冒号非斜杠) + frag 提取
    expect(calls.some(c => c.pattern === "*nitro:routes*:content*")).toBe(true);
    expect(calls.some(c => c.unlinked === 1)).toBe(true);
  });

  test("无 routes 时退化为清空整组", async () => {
    calls.length = 0;
    scanPages = [[]];
    await invalidateContentCaches();
    expect(calls.some(c => c.pattern === "*nitro:routes*")).toBe(true);
  });

  test("根路径片段回退 index;/sitemap 不误伤 /map", async () => {
    calls.length = 0;
    scanPages = [[]];
    await invalidateContentCaches({ routes: ["/"] });
    expect(calls.some(c => c.pattern === "*nitro:routes*:index*")).toBe(true);

    calls.length = 0;
    scanPages = [[]];
    await invalidateContentCaches({ routes: ["/sitemap"] });
    expect(calls.some(c => c.pattern === "*nitro:routes*:sitemap*")).toBe(true);
    expect(calls.some(c => c.pattern === "*nitro:routes*:map*")).toBe(false);
  });
});
