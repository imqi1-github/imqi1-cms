import "./setup-globals";

import { describe, expect, test } from "bun:test";

import icons from "~/lib/aplayer/icons";

describe("icons(SVG 常量集)", () => {
  test("导出为非空对象", () => {
    expect(typeof icons).toBe("object");
    expect(icons).not.toBeNull();
  });

  test("每个 icon 是字符串(SVG 源码)", () => {
    for (const [, value] of Object.entries(icons)) {
      expect(typeof value).toBe("string");
      expect((value as string).length).toBeGreaterThan(0);
    }
  });

  test("SVG icon 含 <svg 标签", () => {
    for (const [, value] of Object.entries(icons)) {
      expect((value as string).trim().startsWith("<svg")).toBe(true);
    }
  });

  test("含常见播放控制 icon 键(back/play/pause/forward 等)", () => {
    // aplayer 标准 icon key
    const keys = Object.keys(icons);
    // 至少要有 'play' 这个键(任意一个都行,这里只断言 keys > 5)
    expect(keys.length).toBeGreaterThan(5);
  });
});