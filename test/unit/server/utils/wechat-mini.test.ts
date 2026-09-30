/**
 * server/utils/wechat-mini.ts:
 *  - isConfigured() = process.env.WECHAT_MINI_APPID && WECHAT_MINI_SECRET
 *  - 未配置 → generateMiniProgramCode 抛"未配置微信小程序凭据"(前端据此隐藏入口)
 *  - getAccessToken 内存缓存 expiresAt,过期前 60s 提前刷新
 *  - token API 响应无 access_token → 抛错(JSON.stringify 原样回传)
 *  - 二维码 API 响应 content-type 含 application/json(微信错误码) → 抛错
 *  - 成功 → 返回 Buffer
 *
 * 注:cachedToken 是模块级 const,跨测试持久化。缓存命中/失败测试通过 ≤ 1 token fetch 间接断言,
 * 不依赖起始缓存状态(若缓存失效,第二次调会因队列空 500 → 抛错,从而测试失败)。
 */
import { afterEach, beforeEach, describe, expect, test } from "bun:test";

const ORIGINAL_FETCH = globalThis.fetch;
const ORIGINAL_APPID = process.env.WECHAT_MINI_APPID;
const ORIGINAL_SECRET = process.env.WECHAT_MINI_SECRET;

let tokenResponses: Array<() => Response> = [];
let qrResponses: Array<() => Response> = [];
let fetchUrls: string[] = [];

function fakeFetch(input: string | URL | Request): Promise<Response> {
  const url = String(input);
  fetchUrls.push(url);
  if (url.includes("/cgi-bin/token")) {
    const next = tokenResponses.shift() ?? (() => new Response("{}", { status: 500 }));
    return Promise.resolve(next());
  }
  if (url.includes("/wxa/getwxacodeunlimit")) {
    const next = qrResponses.shift() ?? (() => new Response("{}", { status: 500 }));
    return Promise.resolve(next());
  }
  return Promise.reject(new Error(`unexpected fetch url: ${url}`));
}

beforeEach(() => {
  fetchUrls = [];
  tokenResponses = [];
  qrResponses = [];
  delete process.env.WECHAT_MINI_APPID;
  delete process.env.WECHAT_MINI_SECRET;
  globalThis.fetch = fakeFetch as typeof fetch;
});
afterEach(() => {
  globalThis.fetch = ORIGINAL_FETCH;
  if (ORIGINAL_APPID === undefined) delete process.env.WECHAT_MINI_APPID;
  else process.env.WECHAT_MINI_APPID = ORIGINAL_APPID;
  if (ORIGINAL_SECRET === undefined) delete process.env.WECHAT_MINI_SECRET;
  else process.env.WECHAT_MINI_SECRET = ORIGINAL_SECRET;
});

const { generateMiniProgramCode } = await import("#server/utils/wechat-mini");

describe("isConfigured 守门", () => {
  test("WECHAT_MINI_APPID/SECRET 都没配 → 抛\"未配置微信小程序凭据\"", async () => {
    await expect(generateMiniProgramCode("cid=1", "pages/article")).rejects.toThrow(/未配置微信小程序凭据/);
    expect(fetchUrls).toHaveLength(0);
  });

  test("只配 APPID → 抛", async () => {
    process.env.WECHAT_MINI_APPID = "wx-test";
    await expect(generateMiniProgramCode("cid=1", "pages/article")).rejects.toThrow(/未配置微信小程序凭据/);
    expect(fetchUrls).toHaveLength(0);
  });

  test("只配 SECRET → 抛", async () => {
    process.env.WECHAT_MINI_SECRET = "sec";
    await expect(generateMiniProgramCode("cid=1", "pages/article")).rejects.toThrow(/未配置微信小程序凭据/);
    expect(fetchUrls).toHaveLength(0);
  });

  test("两项都配 → 才发 token 请求", async () => {
    process.env.WECHAT_MINI_APPID = "wx-test";
    process.env.WECHAT_MINI_SECRET = "sec";
    // expires_in=0:成功后立即让缓存过期(避免污染后续用例,后续用例期望 token 接口被实际调)
    tokenResponses.push(() => new Response(JSON.stringify({ access_token: "tok", expires_in: 0 }), { status: 200 }));
    qrResponses.push(() => new Response(new Uint8Array([1, 2, 3]), { status: 200, headers: { "content-type": "image/jpeg" } }));
    const buf = await generateMiniProgramCode("cid=1", "pages/article");
    expect(buf).toBeInstanceOf(Buffer);
    expect(fetchUrls.length).toBe(2);
    expect(fetchUrls[0]).toContain("/cgi-bin/token");
    expect(fetchUrls[0]).toContain("appid=wx-test");
    expect(fetchUrls[0]).toContain("secret=sec");
  });
});

describe("access_token 错误响应", () => {
  beforeEach(() => {
    process.env.WECHAT_MINI_APPID = "wx-test";
    process.env.WECHAT_MINI_SECRET = "sec";
  });

  // 这些用例期望 token API 抛错 → 必须在任何会"成功设置 token 缓存"的测试之前执行,
  // 否则模块级 cachedToken 跨用例复用 → getAccessToken 不调 fetch,直接返缓存。
  test("token 接口响应无 access_token(微信 errcode) → 抛错(JSON.stringify 含 errcode)", async () => {
    tokenResponses.push(() => new Response(JSON.stringify({ errcode: 40013, errmsg: "invalid appid" }), { status: 200 }));
    await expect(generateMiniProgramCode("a", "p")).rejects.toThrow(/invalid appid/);
    expect(fetchUrls.filter(u => u.includes("/wxa/getwxacodeunlimit"))).toHaveLength(0);
  });

  test("token 响应 HTTP 200 但 body 不是 JSON(网络异常) → 当无效 token 处理 → 抛错", async () => {
    tokenResponses.push(() => new Response("not json", { status: 200 }));
    await expect(generateMiniProgramCode("a", "p")).rejects.toThrow();
  });
});

describe("access_token 缓存命中(单用例覆盖,只断言 ≤ 1 fetch)", () => {
  // 注:cachedToken 跨测试持久化。本测试只断言"2 次连续调用 → token fetch ≤ 1 次 + QR = 2"。
  // 关键证据:queue 只放 1 个 tokenResponse。若缓存失效,第二次调 token 队列空 → 500 → 抛 → 测失败。
  // 因此"QR = 2 + 不抛"间接证明缓存生效;且 ≤ 1 fetch 也量化了最多命中 1 次。
  // 必须排第一:前置用例(2 个 token errcode 抛错)未设缓存,本用例把缓存填 expires_in=0
  // → 立即过期,后续 2 次调用必 refetch。若本用例排后,前面 expires_in=7200 用例会把缓存留作 valid,
  // 本用例 0 fetch 失败。
  test("expires_in=0 → 立即过期(60s 提前刷新),2 次调用必 fetch 2 次 token", async () => {
    process.env.WECHAT_MINI_APPID = "wx-test";
    process.env.WECHAT_MINI_SECRET = "sec";
    tokenResponses.push(() => new Response(JSON.stringify({ access_token: "tok-1", expires_in: 0 }), { status: 200 }));
    tokenResponses.push(() => new Response(JSON.stringify({ access_token: "tok-2", expires_in: 0 }), { status: 200 }));
    qrResponses.push(() => new Response(new Uint8Array([1]), { status: 200, headers: { "content-type": "image/jpeg" } }));
    qrResponses.push(() => new Response(new Uint8Array([2]), { status: 200, headers: { "content-type": "image/jpeg" } }));
    await generateMiniProgramCode("a", "p");
    await generateMiniProgramCode("b", "p");
    expect(fetchUrls.filter(u => u.includes("/cgi-bin/token")).length).toBe(2);
  });

  test("expires_in=7200 + 2 次调用 → token fetch ≤ 1,QR fetch = 2", async () => {
    process.env.WECHAT_MINI_APPID = "wx-test";
    process.env.WECHAT_MINI_SECRET = "sec";
    tokenResponses.push(() => new Response(JSON.stringify({ access_token: "tok-1", expires_in: 7200 }), { status: 200 }));
    qrResponses.push(() => new Response(new Uint8Array([1]), { status: 200, headers: { "content-type": "image/jpeg" } }));
    qrResponses.push(() => new Response(new Uint8Array([2]), { status: 200, headers: { "content-type": "image/jpeg" } }));
    await generateMiniProgramCode("a", "p");
    await generateMiniProgramCode("b", "p");
    const tokenFetches = fetchUrls.filter(u => u.includes("/cgi-bin/token")).length;
    const qrFetches = fetchUrls.filter(u => u.includes("/wxa/getwxacodeunlimit")).length;
    expect(tokenFetches).toBeLessThanOrEqual(1);
    expect(qrFetches).toBe(2);
  });

  test("expires_in 缺省(默认 7200s)→ 2 次调用同样 ≤ 1 token fetch", async () => {
    process.env.WECHAT_MINI_APPID = "wx-test";
    process.env.WECHAT_MINI_SECRET = "sec";
    tokenResponses.push(() => new Response(JSON.stringify({ access_token: "tok" }), { status: 200 }));
    qrResponses.push(() => new Response(new Uint8Array([1]), { status: 200, headers: { "content-type": "image/jpeg" } }));
    qrResponses.push(() => new Response(new Uint8Array([2]), { status: 200, headers: { "content-type": "image/jpeg" } }));
    await generateMiniProgramCode("a", "p");
    await generateMiniProgramCode("b", "p");
    expect(fetchUrls.filter(u => u.includes("/cgi-bin/token")).length).toBeLessThanOrEqual(1);
  });
});

describe("二维码 API 响应", () => {
  beforeEach(() => {
    process.env.WECHAT_MINI_APPID = "wx-test";
    process.env.WECHAT_MINI_SECRET = "sec";
  });

  test("成功:content-type=image/* → 返 Buffer(字节一致)", async () => {
    const body = new Uint8Array([0xff, 0xd8, 0xff, 0xe0, 1, 2, 3]);
    tokenResponses.push(() => new Response(JSON.stringify({ access_token: "tok", expires_in: 7200 }), { status: 200 }));
    qrResponses.push(() => new Response(body, { status: 200, headers: { "content-type": "image/jpeg" } }));
    const buf = await generateMiniProgramCode("cid=1", "pages/article");
    expect(buf).toBeInstanceOf(Buffer);
    expect(buf.length).toBe(body.length);
    expect(Array.from(buf)).toEqual(Array.from(body));
  });

  test("微信返 JSON 错误(content-type=application/json)→ 抛错,带 errcode", async () => {
    tokenResponses.push(() => new Response(JSON.stringify({ access_token: "tok", expires_in: 7200 }), { status: 200 }));
    qrResponses.push(() => new Response(JSON.stringify({ errcode: 45009, errmsg: "reach max api daily quota" }), { status: 200, headers: { "content-type": "application/json" } }));
    await expect(generateMiniProgramCode("a", "p")).rejects.toThrow(/45009/);
  });

  test("缺 content-type 头且 body 非 JSON → 走 Buffer 分支", async () => {
    const body = new Uint8Array([1, 2, 3]);
    tokenResponses.push(() => new Response(JSON.stringify({ access_token: "tok", expires_in: 7200 }), { status: 200 }));
    qrResponses.push(() => new Response(body, { status: 200 }));
    const buf = await generateMiniProgramCode("a", "p");
    expect(buf).toBeInstanceOf(Buffer);
    expect(buf.length).toBe(3);
  });

  test("请求 URL 携带 access_token 参数", async () => {
    tokenResponses.push(() => new Response(JSON.stringify({ access_token: "tok", expires_in: 7200 }), { status: 200 }));
    qrResponses.push(() => new Response(new Uint8Array([1]), { status: 200, headers: { "content-type": "image/jpeg" } }));
    await generateMiniProgramCode("cid=42", "pages/article/detail");
    const qrUrl = fetchUrls.find(u => u.includes("/wxa/getwxacodeunlimit"))!;
    expect(qrUrl).toContain("access_token=tok");
  });
});