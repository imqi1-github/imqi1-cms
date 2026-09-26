import { afterEach, beforeEach, describe, expect, mock, test } from "bun:test";
import { createError as h3CreateError } from "h3";

import "../../helpers/nitro-globals";

// _AMapService 路由:依赖 useRuntimeConfig + h3 proxyRequest + process.env.AMAP_KEY/SECURITY_CODE。
// nitro-globals.ts 已装 createError / getRequestURL 桩;我们额外 stub useRuntimeConfig + proxyRequest。
if (typeof (globalThis as Record<string, unknown>).createError !== "function") {
  (globalThis as Record<string, unknown>).createError = h3CreateError;
}

let origUseRC: unknown;
let origProxyRequest: unknown;
let origSetResponseHeader: unknown;

beforeEach(() => {
  origUseRC = (globalThis as Record<string, unknown>).useRuntimeConfig;
  origProxyRequest = (globalThis as Record<string, unknown>).proxyRequest;
  origSetResponseHeader = (globalThis as Record<string, unknown>).setResponseHeader;
  (globalThis as Record<string, unknown>).proxyRequest = mock(async () => new Response("proxy-stub", { status: 200 }));
  (globalThis as Record<string, unknown>).setResponseHeader = () => {};
});

afterEach(() => {
  if (origUseRC !== undefined) {
    (globalThis as Record<string, unknown>).useRuntimeConfig = origUseRC;
  } else {
    delete (globalThis as Record<string, unknown>).useRuntimeConfig;
  }
  if (origProxyRequest !== undefined) {
    (globalThis as Record<string, unknown>).proxyRequest = origProxyRequest;
  } else {
    delete (globalThis as Record<string, unknown>).proxyRequest;
  }
  // 还原 setResponseHeader 桩(不 delete:破坏 nitro-globals ??= 幂等性,后续 nitro 测试 setResponseHeader is not defined)
  if (origSetResponseHeader !== undefined) {
    (globalThis as Record<string, unknown>).setResponseHeader = origSetResponseHeader;
  }
  delete process.env.AMAP_KEY;
  delete process.env.AMAP_SECURITY_CODE;
});

// 使用相对路径绕过 bun 对 [...] 通配的解析限制
const routePath = "../../../server/routes/_AMapService/[...path].ts";
const { default: amapHandler } = await import(/* @vite-ignore */ routePath);

function makeEvent(url: string) {
  return {
    path: url,
    url,
    node: {
      req: { headers: { host: "localhost" }, url, originalUrl: url },
      res: { setHeader: () => {} },
    },
  };
}

function loadHandler(config: { amapUseServerProxy: boolean }) {
  (globalThis as Record<string, unknown>).useRuntimeConfig = () => ({
    amapUseServerProxy: config.amapUseServerProxy,
  });
  return amapHandler as (event: unknown) => Promise<unknown>;
}

describe("_AMapService route handler", () => {
  // route 直接 throw(同步),不走 nitro 异步包装,rejects 不接 → 用 try/catch 同步捕获
  function callSync(handler: (event: unknown) => unknown, event: unknown): unknown {
    try {
      return handler(event);
    } catch (e) {
      return e;
    }
  }

  test("amapUseServerProxy=false → 抛 404('AMap proxy is disabled')", () => {
    const handler = loadHandler({ amapUseServerProxy: false });
    const err = callSync(handler, makeEvent("/_AMapService/maps")) as { statusCode?: number; message?: string };
    expect(err).toBeInstanceOf(Error);
    expect((err as Error).message).toMatch(/AMap proxy is disabled/);
    expect(err.statusCode).toBe(404);
  });

  test("amapUseServerProxy=true + AMAP_KEY 缺 → 503", () => {
    const handler = loadHandler({ amapUseServerProxy: true });
    delete process.env.AMAP_KEY;
    process.env.AMAP_SECURITY_CODE = "code";
    const err = callSync(handler, makeEvent("/_AMapService/maps")) as { statusCode?: number; message?: string };
    expect(err).toBeInstanceOf(Error);
    expect((err as Error).message).toMatch(/AMap proxy is not configured/);
    expect(err.statusCode).toBe(503);
  });

  test("amapUseServerProxy=true + AMAP_SECURITY_CODE 缺 → 503", () => {
    const handler = loadHandler({ amapUseServerProxy: true });
    process.env.AMAP_KEY = "key";
    delete process.env.AMAP_SECURITY_CODE;
    const err = callSync(handler, makeEvent("/_AMapService/maps")) as { statusCode?: number; message?: string };
    expect(err).toBeInstanceOf(Error);
    expect((err as Error).message).toMatch(/AMap proxy is not configured/);
    expect(err.statusCode).toBe(503);
  });

  test("amapUseServerProxy=true + key + code 齐 + 路径不在 basePath 前缀 → 404('Unknown AMap proxy path')", () => {
    const handler = loadHandler({ amapUseServerProxy: true });
    process.env.AMAP_KEY = "key";
    process.env.AMAP_SECURITY_CODE = "code";
    const err = callSync(handler, makeEvent("/not-a-map-path")) as { statusCode?: number; message?: string };
    expect(err).toBeInstanceOf(Error);
    expect((err as Error).message).toMatch(/Unknown AMap proxy path/);
    expect(err.statusCode).toBe(404);
  });

  // 注:/maps 路径走到 proxyRequest,需完整 stub event.node.res.write 才能不抛 unhandled。
  // mock.module("h3") 进程级污染太大,跳过此分支。webapi/restapi 分支 resolveAmapProxyTarget
  // 与白名单检查已在 test/shared/amap-proxy.test.ts 完整覆盖。
});