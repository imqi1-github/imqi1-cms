import { describe, expect, test } from "bun:test";

import { callAdmin } from "#test/helpers/admin";

const optionsHandler = (await import("#server/api/mini/[...].options")).default;

describe("mini/[...].options.ts(CORS preflight)", () => {
  test("OPTIONS 不抛错(返回空字符串 + statusCode 已在 setResponseStatus)", async () => {
    const r = await callAdmin(optionsHandler, {
      method: "OPTIONS",
      url: "/api/mini/comments",
    });
    // handler 返回 ""(空字符串表示 204 No Content)
    expect(r).toBe("");
  });

  test("任意路径都返回相同 CORS 头(全 wild-card 通配)", async () => {
    await expect(callAdmin(optionsHandler, {
      method: "OPTIONS",
      url: "/api/mini/any/path",
    })).resolves.toBeDefined();
  });
});