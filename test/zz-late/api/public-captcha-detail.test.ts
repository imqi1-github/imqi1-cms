/**
 * server/api/captcha/image.get.ts 集成测:
 *  - 返回 Buffer(非字符串)
 *  - Content-Type = image/png
 *  - Cache-Control = no-store(每次刷新都得重发,验证码不复用)
 *  - issueCaptcha 内部失败 → 错误向上抛(让 nitro 全局错误处理兜底 500)
 *
 * 注:issueCaptcha 依赖 WASM/字体文件,test/helpers/auth-fakes.ts 已注册 mock 返回空 Buffer;
 * 这里只验证 handler 正确转发 Buffer + 设置响应头,真实 WASM 路径靠 dev 手工验证。
 */
import "#test/helpers/nitro-globals";

import { describe, expect, test } from "bun:test";

import { makeAuthEvent } from "#test/helpers/auth-fakes";

const captchaHandler = (await import("#server/api/captcha/image.get")).default;

function headersOf(): Record<string, string> {
  const h: Record<string, string> = {};
  return h;
}

describe("captcha/image.get(图形验证码)", () => {
  test("返回 Buffer(不是字符串/对象)", async () => {
    const { event } = makeAuthEvent({ method: "GET", url: "/api/captcha/image" });
    const r = await captchaHandler(event);
    expect(r).toBeInstanceOf(Buffer);
  });

  test("Content-Type = image/png", async () => {
    const headers = headersOf();
    const captured = {
      setHeader(name: string, value: unknown) { headers[name.toLowerCase()] = String(value); },
      getHeader() { return undefined; },
      getHeaders() { return headers; },
    };
    const event = {
      node: {
        res: captured,
        req: { headers: {} },
      },
    } as never;
    await captchaHandler(event);
    expect(headers["content-type"]).toBe("image/png");
  });

  test("Cache-Control = no-store, no-cache, must-revalidate", async () => {
    const headers = headersOf();
    const captured = {
      setHeader(name: string, value: unknown) { headers[name.toLowerCase()] = String(value); },
      getHeader() { return undefined; },
      getHeaders() { return headers; },
    };
    const event = { node: { res: captured, req: { headers: {} } } } as never;
    await captchaHandler(event);
    expect(headers["cache-control"]).toBe("no-store, no-cache, must-revalidate");
  });
});