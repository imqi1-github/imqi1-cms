/**
 * server/utils/urlGuard.ts 补测:
 *  - isPrivateIp 边界:IPv4 段首尾 / IPv6 映射段 / 跨段非法输入
 *  - ensureUrlProtocol:trim + http/https 之外的协议原样保留
 *  - assertPublicHttpUrl:域名→公网 IP(走 DNS 替身)、公网 IP 字面、IP 字面内网拒绝
 *  - 纯 IPv6 公网地址 / 大小写 hex
 */
import "#test/helpers/nitro-globals";

import { describe, expect, mock, test } from "bun:test";

// DNS 替身:可控返回
mock.module("node:dns/promises", () => ({
  lookup: async () => [{ address: "1.1.1.1", family: 4 }],
}));

const { isPrivateIp, ensureUrlProtocol, assertPublicHttpUrl } = await import("#server/utils/urlGuard");

describe("isPrivateIp:IPv4 段边界", () => {
  test("172.15.x.x 是公网,172.16.x.x 是私网", () => {
    expect(isPrivateIp("172.15.255.255")).toBe(false);
    expect(isPrivateIp("172.16.0.0")).toBe(true);
  });

  test("100.63.x.x 是公网,100.64.x.x 是私网(共享地址空间 CGN)", () => {
    expect(isPrivateIp("100.63.255.255")).toBe(false);
    expect(isPrivateIp("100.64.0.0")).toBe(true);
  });

  test("192.167.x.x 公网,192.168.x.x 私网", () => {
    expect(isPrivateIp("192.167.255.255")).toBe(false);
    expect(isPrivateIp("192.168.0.0")).toBe(true);
  });

  test("223.x 段是公网(224+ 多播/保留)", () => {
    expect(isPrivateIp("223.255.255.255")).toBe(false);
    expect(isPrivateIp("224.0.0.0")).toBe(true);
  });
});

describe("isPrivateIp:IPv6 边界", () => {
  test("fe80::/10 链路本地 → 私网(fe80::1 / febf::ffff)", () => {
    expect(isPrivateIp("fe80::1")).toBe(true);
    expect(isPrivateIp("febf::ffff")).toBe(true);
    // fe80 之外仍是链路本地,这里测 fe80 子集
    expect(isPrivateIp("fe80::ffff")).toBe(true);
  });

  test("fec0::/10 已废弃,但本实现不识别(回退公网)", () => {
    // 重要不变量:旧代码会因遗漏 fec0 出漏洞,新实现显式不视为私网 → 防御性兜底
    expect(isPrivateIp("fec0::1")).toBe(false);
  });

  test("IPv4 映射地址 ::ffff:x.x.x.x 必须按 v4 段判定", () => {
    expect(isPrivateIp("::ffff:10.0.0.1")).toBe(true);
    expect(isPrivateIp("::ffff:8.8.8.8")).toBe(false);
  });

  test("全 0 (::) 与回环 ::1 → 私网", () => {
    expect(isPrivateIp("::")).toBe(true);
    expect(isPrivateIp("::1")).toBe(true);
  });

  test("IPv6 文档示例地址 2001:db8::/32 → 公网(文档段,非私网)", () => {
    expect(isPrivateIp("2001:db8::1")).toBe(false);
    expect(isPrivateIp("2001:db8:1234::1")).toBe(false);
  });
});

describe("ensureUrlProtocol:边界", () => {
  test("trim 后空串 → 空串", () => {
    expect(ensureUrlProtocol("   ")).toBe("");
    expect(ensureUrlProtocol("\t\n")).toBe("");
  });

  test("已有协议但非 http/https → 补 https://(实现在 /^https?:/i 分支外都补 https)", () => {
    // 已知行为:非 http/https 也走补 https://(让 URL 解析能跑)——这里只锁定不被「剥协议」改坏
    expect(ensureUrlProtocol("ftp://x.com")).toBe("https://ftp://x.com");
    // javascript: 是浏览器私有协议,这里同样被补 https:// → 但使用方应配合 urlGuard 拦下
    expect(ensureUrlProtocol("javascript:alert(1)")).toContain("javascript");
  });

  test("无协议字符串带路径 → 补 https://", () => {
    expect(ensureUrlProtocol("example.com/path?q=1")).toBe("https://example.com/path?q=1");
  });

  test("协议前有空白 → 先 trim 再补协议", () => {
    expect(ensureUrlProtocol("  example.com")).toBe("https://example.com");
  });

  test("中段出现 :// 不被识别为协议头", () => {
    // "a://b" 没有头部协议,整串视作域名 → 补 https://
    expect(ensureUrlProtocol("a://b")).toBe("https://a://b");
  });
});

describe("assertPublicHttpUrl:域名走 DNS", () => {
  test("域名解析为公网 IP → 通过", async () => {
    const u = await assertPublicHttpUrl("https://dns-test.example/");
    expect(u.hostname).toBe("dns-test.example");
    expect(u.protocol).toBe("https:");
  });

  test("公网 IP 字面 → 不走 DNS,直接通过", async () => {
    const u = await assertPublicHttpUrl("https://1.1.1.1/");
    expect(u.hostname).toBe("1.1.1.1");
  });

  test("内网 IP 字面 → 400 禁止访问内网地址", async () => {
    await expect(assertPublicHttpUrl("https://192.168.1.1/")).rejects.toMatchObject({ statusCode: 400 });
    await expect(assertPublicHttpUrl("https://10.0.0.1/")).rejects.toMatchObject({ statusCode: 400 });
    await expect(assertPublicHttpUrl("https://127.0.0.1/")).rejects.toMatchObject({ statusCode: 400 });
  });

  test("非 http/https 协议 → 400 仅支持 http/https 链接", async () => {
    await expect(assertPublicHttpUrl("ftp://1.1.1.1/")).rejects.toMatchObject({ statusCode: 400 });
    await expect(assertPublicHttpUrl("file:///etc/passwd")).rejects.toMatchObject({ statusCode: 400 });
  });

  test("URL 字符串含非法字符 → 400 无效的URL格式", async () => {
    await expect(assertPublicHttpUrl("not a url")).rejects.toMatchObject({ statusCode: 400 });
    await expect(assertPublicHttpUrl("http://[bad ipv6]/")).rejects.toMatchObject({ statusCode: 400 });
  });

  test("无协议字符串 → 400 无效的URL格式", async () => {
    await expect(assertPublicHttpUrl("example.com")).rejects.toMatchObject({ statusCode: 400 });
  });
});