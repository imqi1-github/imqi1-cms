import { describe, expect, test } from "bun:test";

import { buildUrlKeys, hasSharedUrlKey } from "#server/utils/cover-keys";

describe("buildUrlKeys", () => {
  test("剥查询串与锚点后归一化", () => {
    const keys = buildUrlKeys("/uploads/a.jpg?v=1#live");
    expect(keys.has("uploads/a.jpg")).toBe(true);
  });

  test("绝对 URL 取 pathname", () => {
    const keys = buildUrlKeys("https://cdn.example.com/uploads/img/a.webp");
    expect(keys.has("uploads/img/a.webp")).toBe(true);
  });

  test("裸文件名(带日期前缀)生成 日期目录 形态候选", () => {
    const keys = buildUrlKeys("2026-01-02-photo.jpg");
    expect(keys.has("uploads/2026/01/2026-01-02-photo.jpg")).toBe(true);
    expect(keys.has("2026-01-02-photo.jpg")).toBe(true);
  });

  test("非法 % 编码回退原始路径不抛", () => {
    expect(() => buildUrlKeys("/uploads/%zz.jpg")).not.toThrow();
  });

  test("相对裸文件名只出文件名候选", () => {
    const keys = buildUrlKeys("a.png");
    expect(keys.has("a.png")).toBe(true);
  });
});

describe("hasSharedUrlKey", () => {
  test("任一候选相交即 true,否则 false", () => {
    const a = buildUrlKeys("/uploads/a.jpg?v=1");
    const b = buildUrlKeys("/uploads/a.jpg");
    expect(hasSharedUrlKey(a, b)).toBe(true);
    expect(hasSharedUrlKey(buildUrlKeys("/uploads/x.jpg"), buildUrlKeys("/uploads/y.jpg"))).toBe(false);
  });
});
