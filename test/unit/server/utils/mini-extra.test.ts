/**
 * server/utils/mini.ts 补测:
 *  - formatRelativeTime 的周/月/年分支(已有测试只覆盖到天)
 *  - toHttps:http→https 升级,https 不变,无协议串不变
 *  - toAbsoluteUrl 的 production 分支(无 origin,默认走 siteConfig.cdnUrl/url)
 */
import { afterAll, describe, expect, test } from "bun:test";

const { formatRelativeTime, toHttps, toAbsoluteUrl } = await import("#server/utils/mini");

const ORIGINAL_NODE_ENV = process.env.NODE_ENV;

afterAll(() => {
  process.env.NODE_ENV = ORIGINAL_NODE_ENV;
});

describe("formatRelativeTime:周/月/年分支", () => {
  test("8 天前 → 「1 周前」", () => {
    expect(formatRelativeTime(new Date(Date.now() - 8 * 86_400_000))).toBe("1 周前");
  });

  test("30 天前 → 「1 个月前」(整月边界落在 month 分支)", () => {
    expect(formatRelativeTime(new Date(Date.now() - 30 * 86_400_000))).toBe("1 个月前");
  });

  test("20 天前 → 「2 周前」", () => {
    expect(formatRelativeTime(new Date(Date.now() - 20 * 86_400_000))).toBe("2 周前");
  });

  test("45 天前 → 「1 个月前」", () => {
    expect(formatRelativeTime(new Date(Date.now() - 45 * 86_400_000))).toBe("1 个月前");
  });

  test("100 天前 → 「3 个月前」", () => {
    expect(formatRelativeTime(new Date(Date.now() - 100 * 86_400_000))).toBe("3 个月前");
  });

  test("400 天前 → 「1 年前」", () => {
    expect(formatRelativeTime(new Date(Date.now() - 400 * 86_400_000))).toBe("1 年前");
  });

  test("3 年前 → 「3 年前」", () => {
    expect(formatRelativeTime(new Date(Date.now() - 3 * 365 * 86_400_000))).toBe("3 年前");
  });

  test("正好 60 秒 → 「1 分钟前」(整边界含 hour 不进位)", () => {
    expect(formatRelativeTime(new Date(Date.now() - 60_000))).toBe("1 分钟前");
  });

  test("正好 60 分钟 → 「1 小时前」", () => {
    expect(formatRelativeTime(new Date(Date.now() - 60 * 60_000))).toBe("1 小时前");
  });

  test("正好 24 小时 → 「1 天前」", () => {
    expect(formatRelativeTime(new Date(Date.now() - 24 * 60 * 60_000))).toBe("1 天前");
  });
});

describe("toHttps:网易云等直链 http→https(CSP 混合内容拦截)", () => {
  test("http:// → https://", () => {
    expect(toHttps("http://music.163.com/song?id=1")).toBe("https://music.163.com/song?id=1");
  });

  test("HTTP:// 大写协议同样升级", () => {
    expect(toHttps("HTTP://x.com/a")).toBe("https://x.com/a");
  });

  test("已经是 https:// → 原样返回", () => {
    expect(toHttps("https://x.com/a")).toBe("https://x.com/a");
  });

  test("// 协议无关 URL(无协议前缀)→ 原样返回", () => {
    expect(toHttps("//x.com/a")).toBe("//x.com/a");
  });

  test("无协议串 → 原样返回", () => {
    expect(toHttps("/uploads/a.mp3")).toBe("/uploads/a.mp3");
  });

  test("字符串中段出现的 http:// 不替换(只有开头才升级)", () => {
    // 设计:仅检测 ^http:// 前缀;中段出现 http:// 不动(避免误伤含字面量的 markdown)
    expect(toHttps("http://x.com/http://y.com")).toBe("https://x.com/http://y.com");
  });
});

describe("toAbsoluteUrl:production 分支", () => {
  test("production 相对路径走 siteConfig.cdnUrl / site.url,不传 origin", () => {
    process.env.NODE_ENV = "production";
    const out = toAbsoluteUrl("/emojis/a.png", "http://localhost:3000");
    expect(out).toMatch(/^https?:\/\//);
    expect(out.endsWith("/emojis/a.png")).toBe(true);
  });

  test("production 裸相对名(不带 /)也补 /", () => {
    process.env.NODE_ENV = "production";
    const out = toAbsoluteUrl("emojis/a.png", "http://localhost:3000");
    expect(out.endsWith("/emojis/a.png")).toBe(true);
  });

  test("absolute URL 即便在 production 也原样返回(已被 new URL 解析)", () => {
    process.env.NODE_ENV = "production";
    const u = "https://cdn.example.com/x.png?v=1";
    expect(toAbsoluteUrl(u, "")).toBe(u);
  });

  test("空串始终返回空串(无论 NODE_ENV)", () => {
    process.env.NODE_ENV = "production";
    expect(toAbsoluteUrl("", "")).toBe("");
    process.env.NODE_ENV = "development";
    expect(toAbsoluteUrl("", "")).toBe("");
  });
});