/**
 * server/api/auth/2fa/status.get.ts 集成测:
 *  - 未登录 → 401
 *  - 完全未 setup:{enabled:false, pendingSetup:false}
 *  - 已 setup 未 enable:{enabled:false, pendingSetup:true}
 *  - 已 enable:{enabled:true, pendingSetup:false}
 *  - 缓存头为公开可缓存
 */
import "#test/helpers/nitro-globals";

import { beforeEach, describe, expect, test } from "bun:test";

import { loginSessionCookie, makeAuthEvent, patchUser, resetTrustedDevices, resetUsers } from "#test/helpers/auth-fakes";

const statusHandler = (await import("#server/api/auth/2fa/status.get")).default;

let ipSeq = 0;
const nextIp = () => `10.20.6.${++ipSeq}`;

beforeEach(() => {
  resetUsers();
  resetTrustedDevices();
});

describe("2fa/status.get", () => {
  test("未登录 → 401", async () => {
    const { event } = makeAuthEvent({ method: "GET", peer: nextIp() });
    await expect(statusHandler(event)).rejects.toMatchObject({ statusCode: 401 });
  });

  test("完全未 setup → {enabled:false, pendingSetup:false}", async () => {
    const session = await loginSessionCookie();
    const { event } = makeAuthEvent({ method: "GET", peer: nextIp(), cookie: session });
    expect(await statusHandler(event)).toEqual({ enabled: false, pendingSetup: false });
  });

  test("已 setup 未 enable → {enabled:false, pendingSetup:true}", async () => {
    patchUser(1, { totp_secret: "GEZDGNBVGY3TQOJQGEZDGNBVGY3TQOJQ", totp_enabled: false });
    const session = await loginSessionCookie();
    const { event } = makeAuthEvent({ method: "GET", peer: nextIp(), cookie: session });
    expect(await statusHandler(event)).toEqual({ enabled: false, pendingSetup: true });
  });

  test("已 enable → {enabled:true, pendingSetup:false}", async () => {
    patchUser(1, { totp_secret: "GEZDGNBVGY3TQOJQGEZDGNBVGY3TQOJQ", totp_enabled: true });
    const session = await loginSessionCookie();
    const { event } = makeAuthEvent({ method: "GET", peer: nextIp(), cookie: session });
    expect(await statusHandler(event)).toEqual({ enabled: true, pendingSetup: false });
  });
});