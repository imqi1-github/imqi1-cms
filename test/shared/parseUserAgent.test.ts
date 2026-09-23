import { describe, expect, test } from "bun:test";

import { parseUserAgent } from "../../shared/parseUserAgent";

describe("parseUserAgent", () => {
  describe("空输入与特殊值", () => {
    test("空字符串返回 null + fallback 图标", () => {
      expect(parseUserAgent("")).toEqual({
        browser: null,
        os: null,
        browserIcon: "ri-computer-line",
        osIcon: "ri-smartphone-line",
      });
    });

    test("小程序专用 agent 'Mini' 返回小程序 + 微信", () => {
      expect(parseUserAgent("Mini")).toEqual({
        browser: "小程序",
        os: "微信",
        browserIcon: "ri-mini-program-fill",
        osIcon: "ri-wechat-fill",
      });
    });
  });

  describe("浏览器识别", () => {
    test("Edge 新旧两种 UA 标记都识别为 Edge", () => {
      const uaEdg = "Mozilla/5.0 (Windows NT 10.0) AppleWebKit/537.36 Edg/120.0.0.0";
      const uaEdge = "Mozilla/5.0 (Windows NT 10.0) AppleWebKit/537.36 Edge/18.18362";
      expect(parseUserAgent(uaEdg).browser).toBe("Edge");
      expect(parseUserAgent(uaEdge).browser).toBe("Edge");
    });

    test("微信 / QQ / UC 浏览器", () => {
      expect(parseUserAgent("MicroMessenger/8.0").browser).toBe("微信");
      expect(parseUserAgent("QQBrowser/13.0").browser).toBe("QQ浏览器");
      expect(parseUserAgent("UBrowser/7.0").browser).toBe("UC浏览器");
    });

    test("OPR 在含 Chrome 的 UA 里仍命中 Opera,不误判 Chrome", () => {
      const ua = "Mozilla/5.0 (Windows NT 10.0) Chrome/120.0.0.0 Safari/537.36 OPR/106.0.0.0";
      expect(parseUserAgent(ua).browser).toBe("Opera");
    });

    test("Chrome / Firefox / Safari 通用档", () => {
      expect(parseUserAgent("Mozilla/5.0 Chrome/120.0 Safari/537.36").browser).toBe("Chrome");
      expect(parseUserAgent("Mozilla/5.0 Firefox/121.0").browser).toBe("Firefox");
      expect(parseUserAgent("Mozilla/5.0 Version/17.0 Safari/605.1.15").browser).toBe("Safari");
    });

    test("旧 IE: MSIE 与 Trident 两种标记都识别为 IE", () => {
      expect(parseUserAgent("Mozilla/5.0 MSIE 10.0").browser).toBe("IE");
      expect(parseUserAgent("Mozilla/5.0 Trident/7.0").browser).toBe("IE");
    });

    test("未知 UA 返回 null 浏览器名 + fallback 图标", () => {
      const r = parseUserAgent("totally-unknown-thing/1.0");
      expect(r.browser).toBeNull();
      expect(r.browserIcon).toBe("ri-computer-line");
    });
  });

  describe("操作系统识别", () => {
    test("Windows / iPhone / iPad / Android", () => {
      expect(parseUserAgent("... Windows NT 10.0 ...").os).toBe("Windows");
      expect(parseUserAgent("... iPhone ...").os).toBe("iOS");
      expect(parseUserAgent("... iPad ...").os).toBe("iOS");
      expect(parseUserAgent("... Android 13 ...").os).toBe("Android");
    });

    test("具体发行版优先于通用 Linux", () => {
      const ua = "Mozilla/5.0 (X11; Ubuntu; Linux x86_64)";
      expect(parseUserAgent(ua).os).toBe("Ubuntu");
    });

    test("无发行版时降级为 Linux", () => {
      const ua = "Mozilla/5.0 (X11; Linux x86_64)";
      expect(parseUserAgent(ua).os).toBe("Linux");
      expect(parseUserAgent(ua).osIcon).toBe("app-linux");
    });

    test("Macintosh 命中 Mac", () => {
      expect(parseUserAgent("Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7)").os).toBe("Mac");
    });

    test("iOS 兜底: like Mac + KHTML 启发式", () => {
      // 一些 iOS WebView UA 只带 like Mac / KHTML 不带 iPhone 字样
      const ua = "Mozilla/5.0 (like Mac; CPU like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko)";
      const r = parseUserAgent(ua);
      expect(r.os).toBe("iOS");
      expect(r.osIcon).toBe("ri-apple-fill");
    });

    test("未知系统返回 null + fallback 图标", () => {
      const r = parseUserAgent("totally-unknown-thing/1.0");
      expect(r.os).toBeNull();
      expect(r.osIcon).toBe("ri-smartphone-line");
    });
  });
});
