// internal-request.ts 在 client 端不返回 SSR 密钥,避免泄漏;
// server 端 process.env.SSR_INTERNAL_REQUEST_SECRET 已配置才带 x-ssr-internal-request 头,
// 未配置/空字符串 → 不带(不回落源码常量,防伪造,见 CLAUDE.md ssr-internal-request-secret)。
//
// bun:test 把 import.meta.server 当作动态计算属性(每次访问重读),
// Object.defineProperty 改的值会被覆盖;且业务函数内部嵌 `if (!import.meta.server)` 判断,
// 无法在 test 里通过 mock.module 替换。故 server 分支走 dev 手工验证,
// 本测试只覆盖 client 分支(bun:test 默认 import.meta.server=undefined/false)。
import { afterEach, describe, expect, test } from "bun:test";

const { getInternalRequestHeaders } = await import("~/utils/internal-request");

describe("getInternalRequestHeaders — client 端(bun:test 默认)", () => {
  const origSecret = process.env.SSR_INTERNAL_REQUEST_SECRET;

  afterEach(() => {
    if (origSecret === undefined) {
      delete process.env.SSR_INTERNAL_REQUEST_SECRET;
    } else {
      process.env.SSR_INTERNAL_REQUEST_SECRET = origSecret;
    }
  });

  test("import.meta.server=false → 即使 secret 已配也不返回密钥头", () => {
    process.env.SSR_INTERNAL_REQUEST_SECRET = "should-be-ignored";
    expect(getInternalRequestHeaders()).toEqual({});
  });

  test("client + 无 secret → 返回 {}", () => {
    delete process.env.SSR_INTERNAL_REQUEST_SECRET;
    expect(getInternalRequestHeaders()).toEqual({});
  });

  test("client + secret 是空字符串 → 返回 {}", () => {
    process.env.SSR_INTERNAL_REQUEST_SECRET = "";
    expect(getInternalRequestHeaders()).toEqual({});
  });

  test("client + secret 很长 → 仍返回 {},密钥不通过 client 端泄漏", () => {
    process.env.SSR_INTERNAL_REQUEST_SECRET = "x".repeat(64);
    const r = getInternalRequestHeaders();
    expect(r).toEqual({});
    expect(r["x-ssr-internal-request"]).toBeUndefined();
  });
});

// server 分支由 dev 手工验证(覆盖 import.meta.server 行为在 bun:test 中不可稳定 mock)。
// 见 CLAUDE.md [ssr-internal-request-secret.md]:
//   1. dev 起 dev server 后,/api/_internal/* 端点(若存在)能拿到该头
//   2. curl -H "x-ssr-internal-request: wrong-secret" /api/_internal/... 应 403
