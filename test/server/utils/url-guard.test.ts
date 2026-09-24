import "#test/helpers/nitro-globals";

import { describe, expect, test } from "bun:test";

import { assertPublicHttpUrl, ensureUrlProtocol, isPrivateIp } from "#server/utils/urlGuard";

describe("ensureUrlProtocol", () => {
  test("无协议补 https://", () => {
    expect(ensureUrlProtocol("example.com")).toBe("https://example.com");
  });

  test("已有 http/https 原样保留(含大写协议)", () => {
    expect(ensureUrlProtocol("http://example.com")).toBe("http://example.com");
    expect(ensureUrlProtocol("HTTPS://example.com")).toBe("HTTPS://example.com");
  });

  test("空串与纯空白返回空串(实现先 trim)", () => {
    expect(ensureUrlProtocol("")).toBe("");
    expect(ensureUrlProtocol("   ")).toBe("");
  });
});

describe("isPrivateIp(IPv4)", () => {
  test.each([
    ["0.0.0.0", true],
    ["10.0.0.1", true],
    ["127.0.0.1", true],
    ["169.254.169.254", true],
    ["172.16.0.1", true],
    ["172.31.255.255", true],
    ["192.168.1.1", true],
    ["100.64.0.1", true],
    ["100.127.255.255", true],
    ["224.0.0.1", true],
    ["8.8.8.8", false],
    ["172.32.0.1", false],
    ["100.128.0.1", false],
    ["192.169.0.1", false],
    ["223.255.255.255", false],
  ])("%s → %s", (ip, expected) => {
    expect(isPrivateIp(ip)).toBe(expected);
  });
});

describe("isPrivateIp(IPv6)", () => {
  test.each([
    ["::", true],
    ["::1", true],
    ["fe80::1", true],
    ["febf::ffff", true],
    ["fc00::1", true],
    ["fdff::ffff", true],
    ["fd12:3456::1", true],
    ["::ffff:192.168.1.1", true],
    ["::ffff:a9fe:a9fe", true],
    ["2001:db8::1", false],
    ["::ffff:8.8.8.8", false],
    ["fec0::1", false],
  ])("%s → %s", (ip, expected) => {
    expect(isPrivateIp(ip)).toBe(expected);
  });
});

describe("isPrivateIp(IPv6 边界)", () => {
  test("hex 映射超 8 位不是合法 v4 尾,返回 false", () => {
    expect(isPrivateIp("::ffff:11223344:5566")).toBe(false);
  });
});

describe("isPrivateIp(非 IP)", () => {
  test("非 IP 输入返回 false", () => {
    expect(isPrivateIp("example.com")).toBe(false);
  });
});

describe("assertPublicHttpUrl", () => {
  test("公网 IP 字面量直接放行(不走 DNS)", async () => {
    const url = await assertPublicHttpUrl("https://8.8.8.8/dns-query");
    expect(url.hostname).toBe("8.8.8.8");
  });

  test.each([
    ["not a url", "无效的URL格式"],
    ["ftp://example.com", "仅支持 http/https 链接"],
    ["http://127.0.0.1/", "禁止访问内网地址"],
    ["http://169.254.169.254/latest/meta-data/", "禁止访问内网地址"],
    ["http://10.0.0.1/", "禁止访问内网地址"],
    ["http://[::1]/", "禁止访问内网地址"],
    ["http://localhost/", "禁止访问内网地址"],
  ])("%s → 400 %s", async (input, message) => {
    try {
      await assertPublicHttpUrl(input);
      throw new Error(`应当抛出 400:${input}`);
    } catch (error) {
      expect((error as { statusCode?: number }).statusCode).toBe(400);
      expect((error as { message?: string }).message).toBe(message);
    }
  });
});
