/**
 * shared/parseUserAgent.ts 补测:
 *  - 顺序炸弹防御:具体档(specific)优先于通用档(generic)命中(避免 Chrome 抢先 Opera/Edge)
 *  - 操作系统具体发行版(Debian/CentOS)优先于 Linux 通用
 *  - iOS 启发式兜底:like Mac + KHTML
 *  - 小程序特判:Mini → 小程序 + 微信
 *  - 多个浏览器特征同时存在时只取最先命中
 */
import { describe, expect, test } from "bun:test";

import { parseUserAgent } from "#shared/parseUserAgent";

describe("parseUserAgent:顺序炸弹防御(具体档优先)", () => {
  test("OPR 在含 Chrome 的 UA 里只命中 Opera(不被 Chrome 抢先)", () => {
    const ua = "Mozilla/5.0 Chrome/120.0.0.0 OPR/106.0.0.0 Safari/537.36";
    expect(parseUserAgent(ua).browser).toBe("Opera");
  });

  test("Edg 在含 Chrome 的 UA 里只命中 Edge", () => {
    const ua = "Mozilla/5.0 Chrome/120.0.0.0 Edg/120.0.0.0 Safari/537.36";
    expect(parseUserAgent(ua).browser).toBe("Edge");
  });

  test("Edge 旧版标记 Edge/ 仍命中 Edge(不命中 Chrome)", () => {
    const ua = "Mozilla/5.0 Chrome/100.0 Edge/18.18362 Safari/537.36";
    expect(parseUserAgent(ua).browser).toBe("Edge");
  });

  test("MicroMessenger 在含 Safari 的微信内置 UA 中命中微信(不被 Safari 抢先)", () => {
    const ua = "Mozilla/5.0 (iPhone) AppleWebKit/605.1.15 (KHTML, like Gecko) Mobile MicroMessenger/8.0";
    expect(parseUserAgent(ua).browser).toBe("微信");
    // 微信内置 UA 同时含 iPhone,系统应识别为 iOS
    expect(parseUserAgent(ua).os).toBe("iOS");
  });

  test("QQBrowser 在含 Chrome 的 UA 中命中 QQ浏览器", () => {
    const ua = "Mozilla/5.0 Chrome/100.0 QQBrowser/13.0 Safari/537.36";
    expect(parseUserAgent(ua).browser).toBe("QQ浏览器");
  });

  test("Opera 旧版标记 Opera/ 与新版 OPR/ 各自命中 Opera", () => {
    expect(parseUserAgent("Mozilla/5.0 Opera/9.0").browser).toBe("Opera");
    expect(parseUserAgent("Mozilla/5.0 OPR/106").browser).toBe("Opera");
  });
});

describe("parseUserAgent:操作系统具体档优先", () => {
  test("Debian 在含 Linux 的 UA 中命中 Debian", () => {
    const ua = "Mozilla/5.0 (X11; Debian; Linux x86_64)";
    expect(parseUserAgent(ua).os).toBe("Debian");
  });

  test("CentOS 在含 Linux 的 UA 中命中 CentOS", () => {
    const ua = "Mozilla/5.0 (X11; CentOS; Linux x86_64)";
    expect(parseUserAgent(ua).os).toBe("CentOS");
  });

  test("Ubuntu 在含 Linux 的 UA 中命中 Ubuntu(已有覆盖,补一个 chrome on ubuntu)", () => {
    const ua = "Mozilla/5.0 (X11; Ubuntu; Linux x86_64) Chrome/120.0";
    const r = parseUserAgent(ua);
    expect(r.os).toBe("Ubuntu");
    expect(r.browser).toBe("Chrome");
  });

  test("Windows NT + Chrome:浏览器 Chrome,系统 Windows", () => {
    const ua = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) Chrome/120.0 Safari/537.36";
    const r = parseUserAgent(ua);
    expect(r.browser).toBe("Chrome");
    expect(r.os).toBe("Windows");
  });

  test("Android Chrome → Android + Chrome", () => {
    const ua = "Mozilla/5.0 (Linux; Android 13; Pixel) Chrome/120.0";
    const r = parseUserAgent(ua);
    expect(r.os).toBe("Android");
    expect(r.browser).toBe("Chrome");
  });
});

describe("parseUserAgent:iOS 启发式兜底", () => {
  test("iOS WebView UA 只含 like Mac + KHTML → 启发式命中 iOS", () => {
    const ua = "Mozilla/5.0 (like Mac; CPU like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko)";
    const r = parseUserAgent(ua);
    expect(r.os).toBe("iOS");
    expect(r.osIcon).toBe("ri-apple-fill");
  });

  test("Macintosh + like Mac(无 KHTML)→ 仍命中 Mac", () => {
    const ua = "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36";
    const r = parseUserAgent(ua);
    expect(r.os).toBe("Mac");
  });

  test("仅含 KHTML 但无 like Mac → 不命中 iOS(防误判)", () => {
    const ua = "Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120";
    const r = parseUserAgent(ua);
    expect(r.os).not.toBe("iOS");
  });
});

describe("parseUserAgent:小程序特判", () => {
  test("严格等于 Mini → 小程序 + 微信", () => {
    const r = parseUserAgent("Mini");
    expect(r).toEqual({
      browser: "小程序",
      os: "微信",
      browserIcon: "ri-mini-program-fill",
      osIcon: "ri-wechat-fill",
    });
  });

  test("含 Mini 字符但不严格相等 → 走通用解析", () => {
    // 防小写变体或前后带字符误判;只接受严格相等
    const r = parseUserAgent("Mozilla/5.0 miniapp something");
    expect(r.browser).not.toBe("小程序");
  });
});

describe("parseUserAgent:返回结构稳定性", () => {
  test("空字符串 → browser=null, os=null, 双 fallback 图标", () => {
    expect(parseUserAgent("")).toEqual({
      browser: null,
      os: null,
      browserIcon: "ri-computer-line",
      osIcon: "ri-smartphone-line",
    });
  });

  test("未知 UA → 双 null + 双 fallback", () => {
    const r = parseUserAgent("totally-unknown-thing/1.0");
    expect(r.browser).toBeNull();
    expect(r.os).toBeNull();
    expect(r.browserIcon).toBe("ri-computer-line");
    expect(r.osIcon).toBe("ri-smartphone-line");
  });

  test("只识别到浏览器 → 系统走 fallback", () => {
    const r = parseUserAgent("Chrome/120.0");
    expect(r.browser).toBe("Chrome");
    expect(r.os).toBeNull();
    expect(r.osIcon).toBe("ri-smartphone-line");
  });

  test("只识别到系统 → 浏览器走 fallback", () => {
    const r = parseUserAgent("X11; Linux x86_64");
    expect(r.os).toBe("Linux");
    expect(r.browser).toBeNull();
    expect(r.browserIcon).toBe("ri-computer-line");
  });
});

describe("parseUserAgent:IE 兜底", () => {
  test("MSIE 标记 → IE", () => {
    expect(parseUserAgent("Mozilla/5.0 MSIE 10.0").browser).toBe("IE");
    expect(parseUserAgent("Mozilla/5.0 MSIE 10.0").browserIcon).toBe("ri-ie-fill");
  });

  test("Trident 标记(IE11)→ IE", () => {
    expect(parseUserAgent("Mozilla/5.0 Trident/7.0").browser).toBe("IE");
  });
});

describe("parseUserAgent:Safari 兜底", () => {
  test("Version/17 Safari/605 → Safari(不带 Chrome)", () => {
    const r = parseUserAgent("Mozilla/5.0 Version/17.0 Safari/605.1.15");
    expect(r.browser).toBe("Safari");
    expect(r.browserIcon).toBe("ri-safari-fill");
  });
});