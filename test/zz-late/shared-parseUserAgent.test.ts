/**
 * shared/parseUserAgent.ts 集成测(纯函数,直接 import 真实现):
 *  - 空串 → 全 fallback
 *  - "Mini" → 小程序 + 微信(特判)
 *  - 「具体档」先于「通用档」命中:
 *    - Edg / Edge(Edge 浏览器,旧/新 token 都覆盖)
 *    - MicroMessenger / QQBrowser / UBrowser(国内壳浏览器)
 *    - OPR(现代 Opera Blink,UA 同时含 Chrome → 必须先命中)
 *    - MSIE / Trident(IE 11 兼容模式)
 *  - 通用 Chrome / Firefox / Safari
 *  - 系统 specific vs generic:
 *    - Windows NT / iPhone / iPad / Android
 *    - Linux 发行版(Ubuntu/Debian/CentOS)优先于 "Linux"
 *    - Macintosh + Linux 兜底
 *  - iOS 启发式:仅含 like Mac + KHTML → 兜底 iOS
 *  - 无匹配 → fallback icon + name=null
 */
import { describe, expect, test } from "bun:test";

import { parseUserAgent } from "#shared/parseUserAgent";

describe("parseUserAgent", () => {
  test("空串 → 全 fallback(name null + 通用 icon)", () => {
    expect(parseUserAgent("")).toEqual({
      browser: null, os: null,
      browserIcon: "ri-computer-line", osIcon: "ri-smartphone-line",
    });
  });

  test("'Mini' → 小程序 + 微信(双图标特判,与小程序端评论对齐)", () => {
    expect(parseUserAgent("Mini")).toEqual({
      browser: "小程序", os: "微信",
      browserIcon: "ri-mini-program-fill", osIcon: "ri-wechat-fill",
    });
  });

  test("Edge 新 token(Edg/)→ 命中具体档(不被通用 Chrome 抢)", () => {
    const ua = "Mozilla/5.0 Edg/120.0.0.0 Chrome/120 Safari/537";
    expect(parseUserAgent(ua)).toMatchObject({ browser: "Edge", browserIcon: "ri-edge-new-fill" });
  });

  test("Edge 旧 token(Edge/)→ 命中具体档", () => {
    expect(parseUserAgent("Mozilla/5.0 Edge/16 Safari/537")).toMatchObject({ browser: "Edge" });
  });

  test("微信内置浏览器(MicroMessenger)→ 微信(不被 Chrome 抢)", () => {
    expect(parseUserAgent("Mozilla/5.0 MicroMessenger/8.0 Chrome/100")).toMatchObject({
      browser: "微信", browserIcon: "ri-wechat-fill",
    });
  });

  test("QQ浏览器(QQBrowser)→ QQ浏览器", () => {
    expect(parseUserAgent("Mozilla/5.0 QQBrowser/13 Chrome/100")).toMatchObject({
      browser: "QQ浏览器", browserIcon: "ri-qq-fill",
    });
  });

  test("UC浏览器(UBrowser)", () => {
    expect(parseUserAgent("Mozilla/5.0 UBrowser/13")).toMatchObject({ browser: "UC浏览器" });
  });

  test("现代 Opera(OPR/,UA 同时含 Chrome)→ 必须先命中 Opera,不被 Chrome 抢", () => {
    const ua = "Mozilla/5.0 OPR/100.0.0.0 Chrome/100 Safari/537";
    expect(parseUserAgent(ua)).toMatchObject({ browser: "Opera", browserIcon: "ri-opera-fill" });
  });

  test("IE 兼容模式(Trident/)→ IE(不被 Chrome/Safari 抢)", () => {
    expect(parseUserAgent("Mozilla/5.0 (Windows NT 10.0; Trident/7.0; rv:11.0)"))
      .toMatchObject({ browser: "IE", browserIcon: "ri-ie-fill" });
  });

  test("IE 老版本(MSIE)→ IE", () => {
    expect(parseUserAgent("Mozilla/5.0 (compatible; MSIE 9.0; Windows NT 6.1)"))
      .toMatchObject({ browser: "IE" });
  });

  test("通用 Chrome → Chrome(不被空 UA 误判)", () => {
    expect(parseUserAgent("Mozilla/5.0 Chrome/120 Safari/537")).toMatchObject({
      browser: "Chrome", browserIcon: "ri-chrome-fill",
    });
  });

  test("Firefox → Firefox", () => {
    expect(parseUserAgent("Mozilla/5.0 Firefox/120")).toMatchObject({
      browser: "Firefox", browserIcon: "ri-firefox-fill",
    });
  });

  test("Safari(显式不含 Chrome)→ Safari", () => {
    expect(parseUserAgent("Mozilla/5.0 Version/17 Safari/605")).toMatchObject({
      browser: "Safari", browserIcon: "ri-safari-fill",
    });
  });

  test("未识别浏览器 → browser null + fallback icon", () => {
    const r = parseUserAgent("totally-unknown-browser/1.0");
    expect(r.browser).toBeNull();
    expect(r.browserIcon).toBe("ri-computer-line");
  });

  test("Windows → Windows NT 命中具体档(被认成 Windows)", () => {
    expect(parseUserAgent("Mozilla/5.0 (Windows NT 10.0; Win64; x64) Chrome/100"))
      .toMatchObject({ os: "Windows", osIcon: "ri-windows-fill" });
  });

  test("iPhone UA → iOS(命中具体档)", () => {
    expect(parseUserAgent("Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit"))
      .toMatchObject({ os: "iOS", osIcon: "ri-apple-fill" });
  });

  test("iPad UA → iOS", () => {
    expect(parseUserAgent("Mozilla/5.0 (iPad; CPU OS 17_0 like Mac OS X)"))
      .toMatchObject({ os: "iOS" });
  });

  test("Android → Android", () => {
    expect(parseUserAgent("Mozilla/5.0 (Linux; Android 14) Chrome/100"))
      .toMatchObject({ os: "Android", osIcon: "ri-android-fill" });
  });

  test("Ubuntu → 具体档先于 Linux 命中", () => {
    expect(parseUserAgent("Mozilla/5.0 (X11; Ubuntu; Linux x86_64) Firefox/100"))
      .toMatchObject({ os: "Ubuntu", osIcon: "ri-ubuntu-fill" });
  });

  test("Debian → Debian(不命中 CentOS 或 Linux)", () => {
    expect(parseUserAgent("Mozilla/5.0 (X11; Debian; Linux x86_64)"))
      .toMatchObject({ os: "Debian", osIcon: "ri-coreos-fill" });
  });

  test("Mac(macOS 通用 Macintosh)→ Mac", () => {
    expect(parseUserAgent("Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) Safari/605"))
      .toMatchObject({ os: "Mac", osIcon: "ri-finder-fill" });
  });

  test("通用 Linux → Linux(非 Debian/Ubuntu/CentOS 发行版)", () => {
    expect(parseUserAgent("Mozilla/5.0 (X11; Linux x86_64) Firefox/100"))
      .toMatchObject({ os: "Linux", osIcon: "app-linux" });
  });

  test("iOS 启发式:仅含 like Mac + KHTML 但无 iPhone/iPad → 兜底 iOS", () => {
    // 一些 iOS WebView UA 不带 iPhone/iPad 但含 like Mac OS X + AppleWebKit(KHTML)
    expect(parseUserAgent("Mozilla/5.0 (like Mac OS X) AppleWebKit KHTML"))
      .toMatchObject({ os: "iOS", osIcon: "ri-apple-fill" });
  });

  test("未知系统 → os null + fallback icon", () => {
    const r = parseUserAgent("Mozilla/5.0 (Plan 9) browser/1.0");
    expect(r.os).toBeNull();
    expect(r.osIcon).toBe("ri-smartphone-line");
  });
});