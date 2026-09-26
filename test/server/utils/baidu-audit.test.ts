import "#test/helpers/nitro-globals";

import { afterAll, beforeEach, describe, expect, test } from "bun:test";

import { mockSharedPrisma, sharedFake } from "#test/helpers/fake-prisma";

mockSharedPrisma();

// getAuditConfig 的读库假件
let auditSettings: Record<string, string> = {};
sharedFake.on("informations", "findMany", async ({ where }: { where: { key: { in: string[] } } }) =>
  where.key.in.filter(k => auditSettings[k] !== undefined).map(k => ({ key: k, value: auditSettings[k] })));

// 全局 fetch 替身:按 URL 分流 token/审核端点
const ORIGINAL_FETCH = globalThis.fetch;
let tokenResponse: () => Response;
let auditResponse: () => Response;
let fetchUrls: string[] = [];
function fakeFetch(input: string | URL | Request): Promise<Response> {
  const url = String(input);
  fetchUrls.push(url);
  if (url.includes("/oauth/2.0/token")) return Promise.resolve(tokenResponse());
  return Promise.resolve(auditResponse());
}

const { auditText, getAuditConfig, mapAuditResultToStatus } = await import("#server/utils/baidu-audit");

beforeEach(() => {
  auditSettings = {};
  fetchUrls = [];
  tokenResponse = () => new Response(JSON.stringify({ access_token: "tok-1", expires_in: 3600 }), { status: 200 });
  auditResponse = () => new Response(JSON.stringify({ conclusion: "合规", conclusionType: 1 }), { status: 200 });
  globalThis.fetch = fakeFetch as typeof fetch;
});
afterAll(() => {
  globalThis.fetch = ORIGINAL_FETCH;
});

describe("getAuditConfig", () => {
  test("moderationApiType=2 才启用;缺省键回空/false", async () => {
    auditSettings = { moderationApiType: "2", baiduApiKey: "k", baiduSecretKey: "s", baiduCheckAdmin: "true" };
    expect(await getAuditConfig()).toEqual({ enabled: true, apiKey: "k", secretKey: "s", checkAdmin: true });
    auditSettings = { moderationApiType: "1" };
    expect(await getAuditConfig()).toEqual({ enabled: false, apiKey: "", secretKey: "", checkAdmin: false });
  });
});

describe("mapAuditResultToStatus(fail-closed)", () => {
  test("1 合规发布;2/3/4/未知一律挂起待审", () => {
    expect(mapAuditResultToStatus(1)).toBe(1);
    expect(mapAuditResultToStatus(2)).toBe(0);
    expect(mapAuditResultToStatus(3)).toBe(0);
    expect(mapAuditResultToStatus(4)).toBe(0);
    expect(mapAuditResultToStatus(99)).toBe(0);
  });
});

describe("auditText", () => {
  test("未启用 / 配置不完整 → conclusionType 0 且不打上游", async () => {
    expect(await auditText("x")).toEqual({ conclusion: "审核未启用", conclusionType: 0 });
    auditSettings = { moderationApiType: "2" };
    expect(await auditText("x")).toEqual({ conclusion: "审核配置不完整", conclusionType: 0 });
    expect(fetchUrls).toHaveLength(0);
  });

  // 以下用例共享模块级 token 缓存,顺序敏感:先测需要"无缓存/过期缓存"的分支,再测会产生长缓存的成功路径
  test("token 响应缺 access_token → 审核服务异常(缓存仍为空)", async () => {
    auditSettings = { moderationApiType: "2", baiduApiKey: "k", baiduSecretKey: "s" };
    tokenResponse = () => new Response("{}", { status: 200 });
    expect(await auditText("x")).toEqual({ conclusion: "审核服务异常", conclusionType: 0 });
    // token 端点失败后不会打审核端点
    expect(fetchUrls.some(u => u.includes("text_censor"))).toBe(false);
  });

  test("token 请求异常 → 审核服务异常", async () => {
    auditSettings = { moderationApiType: "2", baiduApiKey: "k", baiduSecretKey: "s" };
    tokenResponse = () => {
      throw new Error("network down");
    };
    expect(await auditText("x")).toEqual({ conclusion: "审核服务异常", conclusionType: 0 });
  });

  test("expires_in 缺失 → 缓存即刻过期,下次重新取 token(fail-closed 新鲜度)", async () => {
    auditSettings = { moderationApiType: "2", baiduApiKey: "k", baiduSecretKey: "s" };
    tokenResponse = () => new Response(JSON.stringify({ access_token: "short-lived" }), { status: 200 });
    await auditText("第一次");
    const before = fetchUrls.length;
    await auditText("第二次");
    // 每次都是 token+审核 两次请求:过期缓存绝不复用
    expect(fetchUrls.length).toBe(before + 2);
    expect(fetchUrls.at(-2)).toContain("/oauth/2.0/token");
  });

  test("审核端点 error_code / 请求异常 → 审核服务异常", async () => {
    auditSettings = { moderationApiType: "2", baiduApiKey: "k", baiduSecretKey: "s" };
    tokenResponse = () => new Response(JSON.stringify({ access_token: "tok-1", expires_in: 3600 }), { status: 200 });
    auditResponse = () => new Response(JSON.stringify({ error_code: 110, error_msg: "Access token invalid" }), { status: 200 });
    expect(await auditText("x")).toEqual({ conclusion: "审核服务异常", conclusionType: 0 });
    auditResponse = () => {
      throw new Error("boom");
    };
    expect(await auditText("x")).toEqual({ conclusion: "审核服务异常", conclusionType: 0 });
  });

  test("审核成功:透传 conclusion/conclusionType,审核请求带 access_token", async () => {
    auditSettings = { moderationApiType: "2", baiduApiKey: "k", baiduSecretKey: "s" };
    auditResponse = () => new Response(JSON.stringify({ conclusion: "合规", conclusionType: 1 }), { status: 200 });
    const r = await auditText("你好");
    expect(r).toEqual({ conclusion: "合规", conclusionType: 1 });
    expect(fetchUrls.at(-1)).toContain("text_censor");
    expect(fetchUrls.at(-1)).toContain("access_token=tok-1");
  });

  test("token 缓存:expires_in 足量时第二次只打审核端点", async () => {
    auditSettings = { moderationApiType: "2", baiduApiKey: "k", baiduSecretKey: "s" };
    await auditText("第一次");
    const before = fetchUrls.length;
    await auditText("第二次");
    expect(fetchUrls.length).toBe(before + 1);
    expect(fetchUrls.at(-1)).toContain("text_censor");
  });
});
