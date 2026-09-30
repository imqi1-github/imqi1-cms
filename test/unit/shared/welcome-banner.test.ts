import { afterEach, beforeEach, describe, expect, test } from "bun:test";

import { printWelcomeBanner } from "#shared/welcome-banner";
import { siteConfig } from "~~/site.config";

describe("printWelcomeBanner", () => {
  let logs: unknown[][] = [];

  beforeEach(() => {
    logs = [];
    const orig = console.log;
    console.log = (...args: unknown[]) => {
      logs.push(args);
    };
    // test 结束后恢复(防止污染其它测试)
    afterEach(() => {
      console.log = orig;
    });
  });

  test("输出两条 console.log(标题 + ASCII 艺术字)", () => {
    printWelcomeBanner();
    expect(logs).toHaveLength(2);
  });

  test("首条调用 siteConfig.site.name + CSS 样式", () => {
    printWelcomeBanner();
    const [first, second] = logs[0] as [string, string];
    expect(first).toContain(siteConfig.site.name);
    expect(first).toContain("欢迎你的来访");
    // CSS 样式串特征:linear-gradient、padding、border-radius
    expect(typeof second).toBe("string");
    expect(second).toContain("linear-gradient");
    expect(second).toContain("padding");
    expect(second).toContain("border-radius");
  });

  test("第二条输出 6 行 ASCII 艺术字", () => {
    printWelcomeBanner();
    const banner = logs[1][0] as string;
    // 6 行等宽字符(每行以 \n 分隔,共 6 行)
    const lines = banner.split("\n");
    expect(lines).toHaveLength(6);
    for (const line of lines) {
      expect(line.length).toBeGreaterThan(20);
    }
  });

  test("ASCII 含 'IMQI1' 字形(用 ╗╔╚╝ 等 box-drawing 拼出字母)", () => {
    printWelcomeBanner();
    const banner = logs[1][0] as string;
    // 字符特征:实心方块 + 半框字符
    expect(banner).toContain("█");
    expect(banner).toMatch(/[╗╔╚╝║═]/);
  });

  test("不抛异常、可重复调用", () => {
    expect(() => printWelcomeBanner()).not.toThrow();
    expect(() => printWelcomeBanner()).not.toThrow();
    expect(logs.length).toBe(4); // 每次 2 条
  });
});