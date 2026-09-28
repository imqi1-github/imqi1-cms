/**
 * SSRF payload 全集测试:server/utils/urlGuard.ts + server/utils/safe-fetch.ts
 *
 * 覆盖私有 IP / 环回 / 链路本地 / 云元数据 / 协议变种 / DNS rebinding /
 * URL 解析边角 / 编码绕过 攻击向量全集。
 *
 * DNS 用 node:dns/promises mock,可控返回公网 / 私有 IP。
 */
import "#test/helpers/nitro-globals";

import { beforeEach, describe, expect, mock, test } from "bun:test";

// 让 DNS 可控返回(模拟 DNS rebinding / 域名解析到内网)
let dnsLookupResult: Array<{ address: string; family: number }> = [{ address: "1.1.1.1", family: 4 }];
let dnsError: Error | null = null;
mock.module("node:dns/promises", () => ({
  lookup: async (_hostname: string, _opts?: unknown) => {
    if (dnsError) throw dnsError;
    return dnsLookupResult;
  },
}));

const { isPrivateIp, ensureUrlProtocol, assertPublicHttpUrl } = await import("#server/utils/urlGuard");

function resetDns(): void {
  dnsError = null;
  dnsLookupResult = [{ address: "1.1.1.1", family: 4 }];
}

describe("SSRF:isPrivateIp 边界(IPv4 私/公网)", () => {
  test("RFC1918 + 环回 + 元数据 + CGNAT 全段覆盖", () => {
    // 私有/环回/链路/保留
    expect(isPrivateIp("0.0.0.0")).toBe(true); // 0/8
    expect(isPrivateIp("10.0.0.1")).toBe(true); // 10/8
    expect(isPrivateIp("127.0.0.1")).toBe(true); // 127/8 环回
    expect(isPrivateIp("169.254.169.254")).toBe(true); // 云元数据
    expect(isPrivateIp("172.16.0.1")).toBe(true); // 172.16/12
    expect(isPrivateIp("172.31.255.255")).toBe(true);
    expect(isPrivateIp("192.168.0.1")).toBe(true); // 192.168/16
    expect(isPrivateIp("100.64.0.1")).toBe(true); // 100.64/10 CGN
    expect(isPrivateIp("100.127.255.255")).toBe(true);
    expect(isPrivateIp("224.0.0.1")).toBe(true); // 224/4 组播
    expect(isPrivateIp("255.255.255.255")).toBe(true); // 255/4 保留
    // 公网段边界
    expect(isPrivateIp("1.1.1.1")).toBe(false);
    expect(isPrivateIp("8.8.8.8")).toBe(false);
    expect(isPrivateIp("172.15.255.255")).toBe(false); // 172.15/12 上界
    expect(isPrivateIp("172.32.0.0")).toBe(false); // 172.32/12 下界
    expect(isPrivateIp("100.63.255.255")).toBe(false); // CGN 上界
    expect(isPrivateIp("100.128.0.0")).toBe(false); // CGN 下界
    expect(isPrivateIp("223.255.255.255")).toBe(false); // 223/4 上界
  });

  test("整数 / 八进制 / hex 形式 IP:isIP() 严格按 IPv4 字面识别,非标准格式返 false", () => {
    // 127.0.0.1 的几种编码 — Node net.isIP() 只识别标准 dot-decimal,hex/八进制/整数返 0,
    // → isPrivateIp 返 false(本测试钉住此行为;若需拦截需在调用前先 URL parse + host normalize)。
    expect(isPrivateIp("127.0.0.1")).toBe(true); // 标准
    expect(isPrivateIp("0x7f.0.0.1")).toBe(false); // hex 段 → 非标准
    expect(isPrivateIp("0x7f000001")).toBe(false); // hex 整数 → 非标准
    expect(isPrivateIp("2130706433")).toBe(false); // 整数 → 非标准
    expect(isPrivateIp("0177.0.0.1")).toBe(false); // 八进制 → 非标准
    expect(isPrivateIp("017700000001")).toBe(false); // 八进制整数 → 非标准
  });
});

describe("SSRF:isPrivateIp 边界(IPv6)", () => {
  test("IPv6 私有段 + IPv4 映射段", () => {
    expect(isPrivateIp("::1")).toBe(true); // IPv6 环回
    expect(isPrivateIp("::")).toBe(true); // 未指定
    expect(isPrivateIp("fe80::1")).toBe(true); // 链路本地
    expect(isPrivateIp("febf::1")).toBe(true); // fe80::/10 边界
    expect(isPrivateIp("fc00::1")).toBe(true); // 唯一本地 fc00::/7
    expect(isPrivateIp("fd00::1")).toBe(true); // fd00::/8
    expect(isPrivateIp("fe7f::1")).toBe(false); // fe80::/10 上界外
    // IPv4 映射 IPv6(::ffff:x.x.x.x)→ 套 IPv4 判定
    expect(isPrivateIp("::ffff:127.0.0.1")).toBe(true); // 套 IPv4 → 私
    expect(isPrivateIp("::ffff:10.0.0.1")).toBe(true);
    expect(isPrivateIp("::ffff:8.8.8.8")).toBe(false);
    // 公网 IPv6
    expect(isPrivateIp("2001:4860:4860::8888")).toBe(false); // Google DNS
  });
});

describe("SSRF:assertPublicHttpUrl 协议变种", () => {
  beforeEach(resetDns);

  test("非 http(s) 协议:file/ftp/gopher/dict/javascript/data 全部拒绝", async () => {
    const protos = [
      "file:///etc/passwd",
      "ftp://internal.example.com",
      "gopher://internal:25/",
      "dict://internal:11211/stat",
      "javascript:alert(1)",
      "data:text/html,<script>alert(1)</script>",
      "data:text/html;base64,PHNjcmlwdD5hbGVydCgxKTwvc2NyaXB0Pg==",
      "vbscript:msgbox(1)",
      "blob:http://internal/abc",
      "jar:http://internal!/x",
      "chrome://settings",
      "about:blank",
      "view-source:http://internal/",
    ];
    for (const p of protos) {
      await expect(assertPublicHttpUrl(p)).rejects.toMatchObject({ statusCode: 400 });
    }
  });

  test("大小写变种 HTTP:// / hTTpS:// / 全小写也接受", async () => {
    dnsLookupResult = [{ address: "1.1.1.1", family: 4 }];
    const u1 = await assertPublicHttpUrl("HTTP://example.com/");
    expect(u1.protocol).toBe("http:");
    const u2 = await assertPublicHttpUrl("hTTpS://example.com/");
    expect(u2.protocol).toBe("https:");
  });

  test("URL 解析边角:空 / 无主机", async () => {
    await expect(assertPublicHttpUrl("")).rejects.toMatchObject({ statusCode: 400 });
    await expect(assertPublicHttpUrl("http://")).rejects.toMatchObject({ statusCode: 400 });
    // http:///path 解析为 host="path" path="/path"(Node URL 接受,实际合法 URL 不拒)
    // 超长 host(>253):本测试跑前已加 hostname 长度 >253 拒绝
    const longHost = "a".repeat(254) + ".example.com";
    await expect(assertPublicHttpUrl(`http://${longHost}/`)).rejects.toMatchObject({ statusCode: 400 });
  });
});

describe("SSRF:assertPublicHttpUrl 内网绕过攻击向量", () => {
  beforeEach(resetDns);

  test("主机名直接是 IP:环回/链路/元数据/私网全拒绝", async () => {
    const hosts = [
      "127.0.0.1", "127.255.255.255", "10.0.0.1", "172.16.0.1",
      "192.168.0.1", "169.254.169.254", "0.0.0.0",
      "::1", "::", "fe80::1", "fc00::1",
      "[::1]", "[::ffff:127.0.0.1]", "[fe80::1]",
    ];
    for (const h of hosts) {
      await expect(assertPublicHttpUrl(`http://${h}/`)).rejects.toMatchObject({ statusCode: 400 });
    }
  });

  test("主机名变种:localhost + 大小写(精准匹配拦截,trailing dot/subdomain 绕过见下条 known-issue)", async () => {
    for (const h of ["localhost", "LOCALHOST", "LocalHost"]) {
      await expect(assertPublicHttpUrl(`http://${h}/`)).rejects.toMatchObject({ statusCode: 400 });
    }
  });

  test("⚠️ localhost 后缀/子域名也拦:localhost. / localhost.localdomain / x.localhost", async () => {
    // 修复后:hostname 去尾点 + 后缀 .localhost / .localdomain 也拦
    await expect(assertPublicHttpUrl("http://localhost./")).rejects.toMatchObject({ statusCode: 400 });
    await expect(assertPublicHttpUrl("http://localhost.localdomain/")).rejects.toMatchObject({ statusCode: 400 });
    await expect(assertPublicHttpUrl("http://foo.localhost/")).rejects.toMatchObject({ statusCode: 400 });
  });

  test("DNS rebinding:域名解析到内网 IP → 拒绝", async () => {
    dnsLookupResult = [{ address: "127.0.0.1", family: 4 }];
    await expect(assertPublicHttpUrl("http://evil.example.com/")).rejects.toMatchObject({ statusCode: 400 });
    dnsLookupResult = [{ address: "10.0.0.1", family: 4 }];
    await expect(assertPublicHttpUrl("http://internal.example.com/")).rejects.toMatchObject({ statusCode: 400 });
    dnsLookupResult = [{ address: "169.254.169.254", family: 4 }]; // 云元数据
    await expect(assertPublicHttpUrl("http://metadata.aws.example.com/")).rejects.toMatchObject({ statusCode: 400 });
  });

  test("DNS 多 IP:任一为内网 → 拒绝", async () => {
    dnsLookupResult = [
      { address: "1.1.1.1", family: 4 },
      { address: "10.0.0.1", family: 4 }, // 混入内网
    ];
    await expect(assertPublicHttpUrl("http://multi.example.com/")).rejects.toMatchObject({ statusCode: 400 });
  });

  test("DNS 解析失败 → 400", async () => {
    dnsError = new Error("ENOTFOUND");
    await expect(assertPublicHttpUrl("http://nonexistent.invalid/")).rejects.toMatchObject({ statusCode: 400 });
  });

  test("URL auth 段嵌入内网:user@127.0.0.1 路径绕过", async () => {
    // @ 后是真正主机,前面是 user:pass
    // 实际 hostname 解析会取 @ 后的部分 → 走公网 IP 解析
    dnsLookupResult = [{ address: "1.1.1.1", family: 4 }];
    const u = await assertPublicHttpUrl("http://user:pass@example.com/");
    expect(u.hostname).toBe("example.com");
  });

  test("URL # fragment 不影响 hostname(127.0.0.1#@x.com)", async () => {
    // new URL("http://127.0.0.1#@x.com") → "127.0.0.1"(fragment 不影响 host)
    await expect(assertPublicHttpUrl("http://127.0.0.1#@x.com/")).rejects.toMatchObject({ statusCode: 400 });
  });

  test("主机名嵌入 null byte:localhost\x00.evil.com", async () => {
    // DNS 截断可能让 resolver 看到 .evil.com 但前端/日志看到 localhost
    dnsLookupResult = [{ address: "127.0.0.1", family: 4 }];
    // null byte 在 URL 主机里会被拒绝(URL 解析失败 → 400)
    await expect(assertPublicHttpUrl("http://localhost\x00.evil.com/")).rejects.toMatchObject({ statusCode: 400 });
  });
});

describe("SSRF:ensureUrlProtocol 协议补全", () => {
  test("已有 https:// → 原样保留", () => {
    expect(ensureUrlProtocol("https://example.com")).toBe("https://example.com");
  });
  test("已有 http:// → 原样保留", () => {
    expect(ensureUrlProtocol("http://example.com")).toBe("http://example.com");
  });
  test("无协议 → 默认补 https://", () => {
    expect(ensureUrlProtocol("example.com")).toBe("https://example.com");
    expect(ensureUrlProtocol("example.com/path")).toBe("https://example.com/path");
  });
  test("trim + 空字符串处理", () => {
    expect(ensureUrlProtocol("  example.com  ")).toBe("https://example.com");
    expect(ensureUrlProtocol("")).toBe("");
  });
  test("大小写保留(HTTPS://example.com → HTTPS://example.com)", () => {
    expect(ensureUrlProtocol("HTTPS://example.com")).toBe("HTTPS://example.com");
  });
  test("javascript: / data: 等危险协议 → ensureUrlProtocol 给所有非 http(s) 补 https://(危险协议在调用方后续校验)", () => {
    // ensureUrlProtocol 只补协议头,不校验安全 — 调用方(如 links.post handler)自行
    // 校验不允许的协议(javascript:/data: 等)
    expect(ensureUrlProtocol("javascript:alert(1)")).toBe("https://javascript:alert(1)");
    expect(ensureUrlProtocol("data:text/html,<x>")).toBe("https://data:text/html,<x>");
  });
});