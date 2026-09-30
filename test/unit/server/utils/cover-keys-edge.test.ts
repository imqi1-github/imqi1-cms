/**
 * server/utils/cover-keys.ts 补测:
 *  - 哈希参数 (#) 先于查询参数 (?) 剥离
 *  - 绝对 URL → pathname(剥域名前缀)
 *  - uploads/ 路径自身作为候选之一(避免重复套 uploads/)
 *  - 日期前缀文件名候选:uploads/YYYY/MM/file
 *  - 非日期前缀裸文件名只走文件名候选
 *  - decodeURIComponent 失败 → 回退原始 normalized
 */
import { describe, expect, test } from "bun:test";

import { buildUrlKeys, hasSharedUrlKey } from "#server/utils/cover-keys";

describe("buildUrlKeys:路径处理", () => {
  test("哈希在查询前(#id?v=1 视为 #id)", () => {
    // 设计:hash 先剥(可能含 ?),所以 "a#b?c" → 切 hash 在 #b 之前 → "a" + 后续 "?c" 走 query 剥
    const keys = buildUrlKeys("/uploads/a#hash?v=1");
    expect(keys.has("uploads/a")).toBe(true);
  });

  test("绝对 URL 剥协议与域名后归一化", () => {
    const keys = buildUrlKeys("https://cdn.example.com/imgs/2026-03-01-photo.jpg");
    expect(keys.has("imgs/2026-03-01-photo.jpg")).toBe(true);
    expect(keys.has("2026-03-01-photo.jpg")).toBe(true);
    expect(keys.has("uploads/imgs/2026-03-01-photo.jpg")).toBe(true);
  });

  test("uploads/ 开头:不再叠加 uploads/(避免 uploads/uploads/xxx)", () => {
    const keys = buildUrlKeys("/uploads/imgs/a.jpg");
    expect(keys.has("uploads/imgs/a.jpg")).toBe(true);
    expect(keys.has("imgs/a.jpg")).toBe(true); // 剥前缀版本
    expect(keys.has("uploads/uploads/imgs/a.jpg")).toBe(false);
  });

  test("日期前缀文件名:同时给 uploads/ 与 uploads/YYYY/MM/file", () => {
    const keys = buildUrlKeys("2026-09-15-cover.jpg");
    expect(keys.has("2026-09-15-cover.jpg")).toBe(true);
    expect(keys.has("uploads/2026-09-15-cover.jpg")).toBe(true);
    expect(keys.has("uploads/2026/09/2026-09-15-cover.jpg")).toBe(true);
  });

  test("日期前缀但缺日段(-DD-)→ 不出 uploads/YYYY/MM/file 候选", () => {
    // regex /^(\d{4})-(\d{2})-\d{2}-/ 要求完整 YYYY-MM-DD,缺日的串不命中
    const keys = buildUrlKeys("2026-09-photo.jpg");
    expect(keys.has("2026-09-photo.jpg")).toBe(true);
    expect(keys.has("uploads/2026-09-photo.jpg")).toBe(true);
    // 没有 uploads/2026/09/...
    expect([...keys].some(k => k.startsWith("uploads/2026/"))).toBe(false);
  });

  test("绝对 URL + 不带日期前缀:仍走 uploads/date 与 filename 候选", () => {
    const keys = buildUrlKeys("https://x.com/uploads/imgs/photo.jpg");
    expect(keys.has("uploads/imgs/photo.jpg")).toBe(true);
    expect(keys.has("imgs/photo.jpg")).toBe(true);
    expect(keys.has("photo.jpg")).toBe(true);
  });

  test("文件名带空格 / 中文:filename 候选保留原样(不强行 URL 编码)", () => {
    const keys = buildUrlKeys("/imgs/中文 photo.jpg");
    expect(keys.has("imgs/中文 photo.jpg")).toBe(true);
    expect(keys.has("中文 photo.jpg")).toBe(true);
  });

  test("非法 % 编码 → 回退原始路径不抛", () => {
    const keys = buildUrlKeys("/imgs/%E4%B8%AD%FF.jpg");
    expect(keys.size).toBeGreaterThan(0);
  });
});

describe("hasSharedUrlKey:交集判定", () => {
  test("空集与非空集 → false", () => {
    expect(hasSharedUrlKey(new Set(), new Set(["x"]))).toBe(false);
    expect(hasSharedUrlKey(new Set(["x"]), new Set())).toBe(false);
  });

  test("两空集 → false", () => {
    expect(hasSharedUrlKey(new Set(), new Set())).toBe(false);
  });

  test("精确匹配同一 key → true", () => {
    expect(hasSharedUrlKey(new Set(["uploads/a.jpg"]), new Set(["uploads/a.jpg"]))).toBe(true);
  });

  test("日期前缀变体匹配 → true(同一文件的不同候选形式)", () => {
    const a = buildUrlKeys("2026-01-02-photo.jpg");
    const b = buildUrlKeys("/uploads/2026/01/2026-01-02-photo.jpg");
    expect(hasSharedUrlKey(a, b)).toBe(true);
  });

  test("无任何交集 → false", () => {
    expect(hasSharedUrlKey(new Set(["uploads/a.jpg"]), new Set(["uploads/b.jpg"]))).toBe(false);
  });
});