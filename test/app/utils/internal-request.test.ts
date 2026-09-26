import { afterEach, describe, expect, test } from "bun:test";

import { getInternalRequestHeaders } from "~/utils/internal-request";

// SSR_INTERNAL_REQUEST_SECRET 由 server/plugins/ssr-internal-secret.ts 在进程启动时写入。
// bun:test 默认 import.meta.server = false → 走 client 分支永远返回 {},client 拿到
// 空对象就安全,防止 x-ssr-internal-request 头被泄漏到第三方请求。
describe("getInternalRequestHeaders (client 分支)", () => {
  test("client 模式:永不返回 x-ssr-internal-request header", () => {
    expect(getInternalRequestHeaders()).toEqual({});
  });

  test("client 模式 + 误设 SSR_INTERNAL_REQUEST_REQUEST_SECRET → 仍返回空(secret 不会泄漏)", () => {
    const orig = process.env.SSR_INTERNAL_REQUEST_SECRET;
    process.env.SSR_INTERNAL_REQUEST_SECRET = "leaked-secret";
    try {
      expect(getInternalRequestHeaders()).toEqual({});
      expect(Object.keys(getInternalRequestHeaders())).not.toContain("x-ssr-internal-request");
    } finally {
      if (orig === undefined) delete process.env.SSR_INTERNAL_REQUEST_SECRET;
      else process.env.SSR_INTERNAL_REQUEST_SECRET = orig;
    }
  });

  test("client 模式不依赖 process.env(直接 import 调用立即返回)", () => {
    const before = process.env.SSR_INTERNAL_REQUEST_SECRET;
    delete process.env.SSR_INTERNAL_REQUEST_SECRET;
    expect(getInternalRequestHeaders()).toEqual({});
    if (before !== undefined) process.env.SSR_INTERNAL_REQUEST_SECRET = before;
  });
});

// 注:server 分支(import.meta.server=true + 有 secret → 返回 secret 头)在 bun:test 下
// 触发不到,因为 import.meta.server 是模块级 Vite 编译期常量,Bun.plugin 改 server=true
// 会污染 tsc/eslint 与 mock.module 链(见 composable-test-happy-dom-effectscope 记忆)。
// 服务端真分支由 server/plugins/ssr-internal-secret.test.ts 已覆盖反向校验。
afterEach(() => {
  // 测试间不残留 secret(虽然不影响 client 分支,但保持环境清洁)
  delete process.env.SSR_INTERNAL_REQUEST_SECRET;
});