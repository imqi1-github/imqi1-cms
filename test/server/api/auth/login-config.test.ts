/**
 * /api/auth/login-config.get:登录页自适应验证码探针
 *
 *  - 公开接口,仅返回 captchaRequired(boolean) = hasRecentFailures(ip)
 *  - 缓存头:no-store(避免代理/浏览器缓存把"该 IP 是否需验证码"误共享给其他访客)
 *  - 不暴露任何用户/会话数据
 */
import "#test/helpers/nitro-globals";

import { beforeEach, describe, expect, mock, test } from "bun:test";

import { makeAuthEvent } from "#test/helpers/auth-fakes";

const { default: handler } = await import("#server/api/auth/login-config.get");

let hasFailures = false;
mock.module("#server/utils/login-rate-limit", () => ({
  hasRecentFailures: async () => hasFailures,
}));

let ipSeq = 0;
const nextIp = () => `10.5.${++ipSeq}.1`;

beforeEach(() => {
  hasFailures = false;
});

describe("login-config.get:缓存头", () => {
  test("始终 no-store(防止 IP 信息跨用户缓存)", async () => {
    const { event, headers } = makeAuthEvent({ method: "GET", peer: nextIp() });
    await handler(event);
    expect(headers["cache-control"]).toBe("no-store");
  });

  test("无论 captchaRequired 取值,缓存头都不变", async () => {
    hasFailures = true;
    const { event, headers } = makeAuthEvent({ method: "GET", peer: nextIp() });
    await handler(event);
    expect(headers["cache-control"]).toBe("no-store");
  });
});

describe("login-config.get:captchaRequired 字段", () => {
  test("无失败时 captchaRequired=false", async () => {
    hasFailures = false;
    const { event } = makeAuthEvent({ method: "GET", peer: nextIp() });
    expect(await handler(event)).toEqual({ captchaRequired: false });
  });

  test("有失败时 captchaRequired=true", async () => {
    hasFailures = true;
    const { event } = makeAuthEvent({ method: "GET", peer: nextIp() });
    expect(await handler(event)).toEqual({ captchaRequired: true });
  });

  test("调用 hasRecentFailures 时传入对端 IP(按 IP 隔离)", async () => {
    const seenIps: string[] = [];
    mock.module("#server/utils/login-rate-limit", () => ({
      hasRecentFailures: async (ip: string) => {
        seenIps.push(ip);
        return false;
      },
    }));
    const { event } = makeAuthEvent({ method: "GET", peer: "10.5.99.99" });
    await handler(event);
    expect(seenIps).toEqual(["10.5.99.99"]);
  });
});

describe("login-config.get:响应体 shape 稳定", () => {
  test("不暴露 user / ip / session 等敏感字段", async () => {
    const { event } = makeAuthEvent({ method: "GET", peer: nextIp() });
    const r = (await handler(event)) as Record<string, unknown>;
    expect(Object.keys(r).sort()).toEqual(["captchaRequired"]);
  });

  test("不依赖会话(无需登录即可访问,符合公开探针语义)", async () => {
    const { event } = makeAuthEvent({ method: "GET", peer: nextIp(), cookie: "" });
    expect(await handler(event)).toEqual({ captchaRequired: false });
  });
});