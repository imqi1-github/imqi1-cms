/**
 * server/api/check-link.get.ts 集成测:
 *  - url 缺省/空 → 400(业务校验原样抛)
 *  - 公网 URL ok → status:"up" + statusCode 透传
 *  - 公网 URL 非 2xx → status:"down" + 携带 statusCode(自定义响应体,非抛错)
 *  - fetchPublicUrl 抛业务 statusCode(SSRF/内网拦截)→ 原样抛,handler 不吞
 *  - AbortError(超时)→ status:"down" message:"请求超时"
 *  - 其它错误(连接失败等)→ status:"down" message:"链接不可访问"
 */
import "#test/helpers/nitro-globals";

import { beforeEach, describe, expect, mock, test } from "bun:test";

import { callAdmin } from "#test/helpers/admin";

let upstreamResult:
  | { kind: "ok"; up: boolean; statusCode: number }
  | { kind: "throwStatus"; statusCode: number; message: string }
  | { kind: "abort" }
  | { kind: "error"; message: string };
mock.module("#server/utils/safe-fetch", () => ({
  fetchPublicUrl: async () => {
    const r = upstreamResult;
    if (r.kind === "ok") return { up: r.up, statusCode: r.statusCode };
    if (r.kind === "throwStatus") {
      throw Object.assign(new Error(r.message), { statusCode: r.statusCode });
    }
    if (r.kind === "abort") {
      throw Object.assign(new DOMException("aborted", "AbortError"));
    }
    throw new Error(r.message);
  },
}));

const checkLinkHandler = (await import("#server/api/check-link.get")).default;

beforeEach(() => {
  upstreamResult = { kind: "ok", up: true, statusCode: 200 };
});

describe("check-link.get(友链存活探测)", () => {
  test("url 缺省 → 400 业务错", async () => {
    await expect(callAdmin(checkLinkHandler, { method: "GET", url: "/api/check-link" }))
      .rejects.toMatchObject({ statusCode: 400 });
  });

  test("url 非字符串 → 400", async () => {
    // url 参数被解析为数组 → typeof !== "string" → 400
    await expect(callAdmin(checkLinkHandler, { method: "GET", url: "/api/check-link?url=a&url=b" }))
      .rejects.toMatchObject({ statusCode: 400 });
  });

  test("公网 URL ok → status:up + 透传 statusCode", async () => {
    upstreamResult = { kind: "ok", up: true, statusCode: 204 };
    const r = (await callAdmin(checkLinkHandler, {
      method: "GET",
      url: "/api/check-link?url=https%3A%2F%2Fexample.com",
    })) as unknown as { status: string; statusCode: number; message: string };
    expect(r.status).toBe("up");
    expect(r.statusCode).toBe(204);
    expect(r.message).toContain("可访问");
  });

  test("远端返回 5xx → status:down + 携带 statusCode(非抛错)", async () => {
    upstreamResult = { kind: "ok", up: false, statusCode: 503 };
    const r = (await callAdmin(checkLinkHandler, {
      method: "GET",
      url: "/api/check-link?url=https%3A%2F%2Fexample.com",
    })) as unknown as { status: string; statusCode: number; message: string };
    expect(r.status).toBe("down");
    expect(r.statusCode).toBe(503);
    expect(r.message).toContain("503");
  });

  test("fetchPublicUrl 抛业务 statusCode(SSRF 拦截)→ 原样抛", async () => {
    upstreamResult = { kind: "throwStatus", statusCode: 400, message: "非法 URL" };
    await expect(callAdmin(checkLinkHandler, {
      method: "GET",
      url: "/api/check-link?url=http%3A%2F%2F10.0.0.1",
    })).rejects.toMatchObject({ statusCode: 400 });
  });

  test("AbortError(超时)→ status:down message:请求超时", async () => {
    upstreamResult = { kind: "abort" };
    const r = (await callAdmin(checkLinkHandler, {
      method: "GET",
      url: "/api/check-link?url=https%3A%2F%2Fslow.example.com",
    })) as unknown as { status: string; message: string };
    expect(r.status).toBe("down");
    expect(r.message).toBe("请求超时");
  });

  test("其它错误(连接失败)→ status:down message:链接不可访问(不泄漏内部细节)", async () => {
    upstreamResult = { kind: "error", message: "ENOTFOUND dns.invalid" };
    const r = (await callAdmin(checkLinkHandler, {
      method: "GET",
      url: "/api/check-link?url=https%3A%2F%2Fnonexistent.example",
    })) as unknown as { status: string; message: string };
    expect(r.status).toBe("down");
    expect(r.message).toBe("链接不可访问");
  });
});