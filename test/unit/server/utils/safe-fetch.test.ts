import "#test/helpers/nitro-globals";

import { beforeEach, describe, expect, mock, test } from "bun:test";


// DNS 与 undici 都用可控替身:本文件专测 SSRF 防护逻辑,不打真实网络
let dnsResult: Array<{ address: string; family: number }> = [{ address: "93.184.216.34", family: 4 }];
let dnsThrows = false;
mock.module("node:dns/promises", () => ({
  lookup: async () => {
    if (dnsThrows) throw new Error("ENOTFOUND");
    return dnsResult;
  },
}));

// undici:Agent 记录 lookup 配置,fetch 按队列返回响应
const agentLookupCalls: Array<{ hostname: string; all?: boolean }> = [];
let fetchQueue: Array<{ status: number; headers?: Record<string, string>; body?: string }> = [];
let fetchError: Error | null = null;
const fetchedUrls: string[] = [];

mock.module("undici", () => ({
  Agent: class {
    constructor(public opts: { connect?: { lookup?: (h: string, o: { all?: boolean }, cb: (e: unknown, a?: unknown, f?: number) => void) => void } }) {}
    async close() {}
  },
  fetch: async (url: string, init: Record<string, unknown>) => {
    fetchedUrls.push(url);
    // 触发钉定 lookup,验证返回的是已校验 IP
    const lookup = (init.dispatcher as { opts?: { connect?: { lookup?: (h: string, o: { all?: boolean }, cb: (e: unknown, a?: unknown, f?: number) => void) => void } } })
      ?.opts?.connect?.lookup;
    if (lookup) {
      lookup(new URL(url).hostname, { all: false }, () => {});
      agentLookupCalls.push({ hostname: new URL(url).hostname });
    }
    if (fetchError) throw fetchError;
    const next = fetchQueue.shift() ?? { status: 200, body: "ok" };
    return {
      ok: next.status >= 200 && next.status < 300,
      status: next.status,
      headers: { get: (k: string) => next.headers?.[k.toLowerCase()] ?? null },
      text: async () => next.body ?? "",
    };
  },
}));

const { resolvePublicIps, createPinnedPublicDispatcher, fetchPublicUrl } = await import("#server/utils/safe-fetch");

beforeEach(() => {
  dnsResult = [{ address: "93.184.216.34", family: 4 }];
  dnsThrows = false;
  fetchQueue = [];
  fetchError = null;
  fetchedUrls.length = 0;
  agentLookupCalls.length = 0;
});

describe("resolvePublicIps", () => {
  test("IP 字面量直接返回,不查 DNS", async () => {
    expect(await resolvePublicIps("8.8.8.8")).toEqual([{ address: "8.8.8.8", family: 4 }]);
    expect(await resolvePublicIps("2001:db8::1")).toEqual([{ address: "2001:db8::1", family: 6 }]);
  });

  test("域名解析后过滤私有 IP", async () => {
    dnsResult = [
      { address: "93.184.216.34", family: 4 },
      { address: "127.0.0.1", family: 4 },
      { address: "10.0.0.5", family: 4 },
    ];
    expect(await resolvePublicIps("example.com")).toEqual([{ address: "93.184.216.34", family: 4 }]);
  });

  test("DNS 解析失败 → 400", async () => {
    dnsThrows = true;
    await expect(resolvePublicIps("nope.invalid")).rejects.toMatchObject({ statusCode: 400 });
  });

  test("全为私有地址时返回空数组(由调用方拒绝)", async () => {
    dnsResult = [{ address: "192.168.1.1", family: 4 }];
    expect(await resolvePublicIps("internal.local")).toEqual([]);
  });
});

describe("createPinnedPublicDispatcher", () => {
  test("公网域名:返回钉定 IP 的 agent 与规范化 URL", async () => {
    const { url, agent } = await createPinnedPublicDispatcher("https://example.com/a");
    expect(url.href).toBe("https://example.com/a");
    expect(agent).toBeTruthy();
  });

  test("解析不出公网 IP → 400", async () => {
    dnsResult = [{ address: "169.254.169.254", family: 4 }];
    await expect(createPinnedPublicDispatcher("https://evil.com/")).rejects.toMatchObject({ statusCode: 400 });
  });

  test("内网字面量 → 400(assertPublicHttpUrl 拦下)", async () => {
    await expect(createPinnedPublicDispatcher("http://127.0.0.1/")).rejects.toMatchObject({ statusCode: 400 });
  });
});

describe("fetchPublicUrl(重定向与超时)", () => {
  test("单次成功:响应交给 process 处理", async () => {
    fetchQueue = [{ status: 200, body: "hello" }];
    const r = await fetchPublicUrl("https://example.com/", async res => res.text());
    expect(r).toBe("hello");
    expect(fetchedUrls).toEqual(["https://example.com/"]);
  });

  test("跟随 302:每跳重新校验并钉定 IP", async () => {
    fetchQueue = [
      { status: 302, headers: { location: "https://cdn.example.com/final" } },
      { status: 200, body: "final" },
    ];
    const r = await fetchPublicUrl("https://example.com/start", async res => res.text());
    expect(r).toBe("final");
    expect(fetchedUrls).toEqual(["https://example.com/start", "https://cdn.example.com/final"]);
  });

  test("重定向到非 http(s) 协议 → 抛错", async () => {
    fetchQueue = [{ status: 302, headers: { location: "file:///etc/passwd" } }];
    await expect(fetchPublicUrl("https://example.com/", async res => res.text())).rejects.toThrow();
  });

  test("重定向 Location 非法 → 抛错", async () => {
    fetchQueue = [{ status: 302, headers: { location: "http://[bad" } }];
    await expect(fetchPublicUrl("https://example.com/", async res => res.text())).rejects.toThrow();
  });

  test("超过最大跳数 → 抛错", async () => {
    fetchQueue = Array.from({ length: 8 }, (_, i) => ({
      status: 302,
      headers: { location: `https://example.com/hop${i}` },
    }));
    await expect(fetchPublicUrl("https://example.com/", async res => res.text())).rejects.toThrow(/重定向超过/);
  });

  test("304 与其它 3xx 不当作重定向", async () => {
    fetchQueue = [{ status: 304, body: "not-modified" }];
    const r = await fetchPublicUrl("https://example.com/", async res => res.text());
    expect(r).toBe("not-modified");
  });
});
// ===== rss 集成:经真实 fetchPublicUrl + mock undici(单一 mock 体系,避免两文件 mock 互斥) =====

const { sanitizeExternalUrl, getSubscriptionStats, getSourceStatus } = await import("#server/utils/rss");

describe("rss/sanitizeExternalUrl", () => {
  test("只放行 http/https;javascript:/data: 等置空", () => {
    expect(sanitizeExternalUrl("https://a.com/x")).toBe("https://a.com/x");
    expect(sanitizeExternalUrl("javascript:alert(1)")).toBe("");
    expect(sanitizeExternalUrl("data:text/html,x")).toBe("");
    expect(sanitizeExternalUrl(null)).toBe("");
  });
});

// rss 的抓取/写库路径依赖 prisma 假件,而该假件是全进程共享的 handler 表:
// updateAllSubscribes 内部有 await 间隙,期间可被其它测试文件重新注册(实测全量下不稳定),
// 故此处只测不依赖 prisma 的纯逻辑;抓取路径由 rss-scheduler 插件测试间接覆盖。

describe("rss/内存统计(不依赖 prisma)", () => {
  test("getSubscriptionStats/getSourceStatus 初始可读", () => {
    expect(typeof getSubscriptionStats().updateCount).toBe("number");
    expect(getSourceStatus(1)).toBeNull();
  });
});
