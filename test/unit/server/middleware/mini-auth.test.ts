import "#test/helpers/nitro-globals";

import { createHmac } from "node:crypto";

import { afterAll, describe, expect, test } from "bun:test";

const handler = (await import("#server/middleware/mini-auth")).default as (e: unknown) => unknown;

const SECRET = "test-mini-secret";
const ORIGINAL_SECRET = process.env.MINI_API_SECRET;

afterAll(() => {
  if (ORIGINAL_SECRET === undefined) delete process.env.MINI_API_SECRET;
  else process.env.MINI_API_SECRET = ORIGINAL_SECRET;
});

// 造 event 并按 middleware 约定计算签名
function makeEvent(opts: {
  url: string;
  method?: string;
  headers?: Record<string, string>;
  timestamp?: string;
  nonce?: string;
  sign?: string;
}) {
  const timestamp = opts.timestamp ?? String(Math.floor(Date.now() / 1000));
  const nonce = opts.nonce ?? crypto.randomUUID();
  const method = (opts.method ?? "GET").toUpperCase();
  const sign = opts.sign ?? createHmac("sha256", SECRET).update(`${method}\n${opts.url}\n${timestamp}\n${nonce}`, "utf8").digest("hex");
  const headers: Record<string, string> = {
    "x-mini-timestamp": opts.headers?.["x-mini-timestamp"] ?? timestamp,
    "x-mini-nonce": opts.headers?.["x-mini-nonce"] ?? nonce,
    "x-mini-sign": opts.headers?.["x-mini-sign"] ?? sign,
    ...opts.headers,
  };
  return {
    node: {
      req: { url: opts.url, method, headers },
      res: { setHeader() {}, getHeaders: () => ({}) },
    },
  };
}

describe("mini-auth middleware:放行", () => {
  test("非 /api/mini 路径跳过(未配密钥也跳)", () => {
    delete process.env.MINI_API_SECRET;
    const event = { node: { req: { url: "/api/links", method: "GET", headers: {} } } };
    expect(handler(event)).toBeUndefined();
  });

  test("合法签名放行", () => {
    process.env.MINI_API_SECRET = SECRET;
    const event = makeEvent({ url: "/api/mini/content/1", method: "GET" });
    expect(handler(event)).toBeUndefined();
  });

  test("POST 带查询串的路径签名一致即放行", () => {
    process.env.MINI_API_SECRET = SECRET;
    const event = makeEvent({ url: "/api/mini/comments?page=2", method: "POST" });
    expect(handler(event)).toBeUndefined();
  });
});

describe("mini-auth middleware:拦截(401 + 空串)", () => {
  test("生产未配 MINI_API_SECRET 时 fail-closed", () => {
    delete process.env.MINI_API_SECRET;
    const event = {
      node: {
        req: { url: "/api/mini/content/1", method: "GET", headers: {} },
        res: { setHeader() {}, getHeaders: () => ({}) },
      },
    };
    expect(handler(event)).toBe("");
  });

  test("签名不匹配拒绝", () => {
    process.env.MINI_API_SECRET = SECRET;
    const event = makeEvent({ url: "/api/mini/content/1", sign: "deadbeef".repeat(8) });
    expect(handler(event)).toBe("");
  });

  test("缺少任一签名头拒绝", () => {
    process.env.MINI_API_SECRET = SECRET;
    const event = makeEvent({ url: "/api/mini/content/1", headers: { "x-mini-sign": "" } });
    expect(handler(event)).toBe("");
  });

  test("时间戳过期(±300s 外)拒绝", () => {
    process.env.MINI_API_SECRET = SECRET;
    const event = makeEvent({ url: "/api/mini/content/1", timestamp: String(Math.floor(Date.now() / 1000) - 301) });
    expect(handler(event)).toBe("");
  });

  test("窗口内同 nonce 重放拒绝(首次放行,第二次 401)", () => {
    process.env.MINI_API_SECRET = SECRET;
    const nonce = crypto.randomUUID();
    const first = makeEvent({ url: "/api/mini/content/9", nonce });
    expect(handler(first)).toBeUndefined();
    const second = makeEvent({ url: "/api/mini/content/9", nonce });
    expect(handler(second)).toBe("");
  });
});
