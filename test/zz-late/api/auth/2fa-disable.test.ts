/**
 * server/api/auth/2fa/disable.post.ts 集成测:
 *  - 未登录 → 401
 *  - CSRF 缺失 → 403
 *  - 未启用 2FA → 400
 *  - 既无 code 也无 password → 400
 *  - code 错 + password 错 → 400
 *  - 动态码确认可停用
 *  - 密码确认可停用(登录器损坏兜底)
 *  - 停用后清除 totp_secret 并删除 trusted_device cookie
 */
import "#test/helpers/nitro-globals";

import { beforeEach, describe, expect, test } from "bun:test";

import {
  CSRF_TOKEN,
  currentTotpCode,
  loginSessionCookie,
  makeAuthEvent,
  patchUser,
  resetTrustedDevices,
  resetUsers,
  TEST_PASSWORD,
} from "#test/helpers/auth-fakes";
import { sharedFake } from "#test/helpers/fake-prisma";

const disableHandler = (await import("#server/api/auth/2fa/disable.post")).default;

let ipSeq = 0;
const nextIp = () => `10.20.5.${++ipSeq}`;

beforeEach(() => {
  resetUsers();
  resetTrustedDevices();
});

async function authedEvent(extra: { body?: Record<string, unknown>; cookie?: string } = {}) {
  const session = await loginSessionCookie();
  return makeAuthEvent({
    method: "POST",
    peer: nextIp(),
    cookie: `${session}; csrf_token=${CSRF_TOKEN}${extra.cookie ? `; ${extra.cookie}` : ""}`,
    body: { csrfToken: CSRF_TOKEN, ...extra.body },
  });
}

const RFC_SECRET = "GEZDGNBVGY3TQOJQGEZDGNBVGY3TQOJQ";

describe("2fa/disable.post:鉴权与前置", () => {
  test("未登录 → 401", async () => {
    const { event } = makeAuthEvent({ method: "POST", peer: nextIp(), body: { csrfToken: CSRF_TOKEN, password: TEST_PASSWORD } });
    await expect(disableHandler(event)).rejects.toMatchObject({ statusCode: 401 });
  });

  test("CSRF 缺失 → 403", async () => {
    patchUser(1, { totp_secret: RFC_SECRET, totp_enabled: true });
    const session = await loginSessionCookie();
    const { event } = makeAuthEvent({ method: "POST", peer: nextIp(), cookie: session, body: { password: TEST_PASSWORD } });
    await expect(disableHandler(event)).rejects.toMatchObject({ statusCode: 403 });
  });

  test("未启用 2FA → 400 两步验证尚未开启", async () => {
    const { event } = await authedEvent({ body: { code: "287082" } });
    await expect(disableHandler(event)).rejects.toMatchObject({ statusCode: 400, message: "两步验证尚未开启" });
  });

  test("既无 code 也无 password → 400", async () => {
    patchUser(1, { totp_secret: RFC_SECRET, totp_enabled: true });
    const { event } = await authedEvent({ body: {} });
    await expect(disableHandler(event)).rejects.toMatchObject({ statusCode: 400 });
  });
});

describe("2fa/disable.post:确认方式", () => {
  test("动态码确认 → enabled:false,DB totp_secret 清空", async () => {
    patchUser(1, { totp_secret: RFC_SECRET, totp_enabled: true });
    const { event } = await authedEvent({ body: { code: currentTotpCode(RFC_SECRET) } });
    await expect(disableHandler(event)).resolves.toEqual({ enabled: false });
    const db = await sharedFake.prisma.users.findUnique({ where: { uid: 1 }, select: { totp_enabled: true, totp_secret: true } });
    expect(db?.totp_enabled).toBe(false);
    expect(db?.totp_secret).toBeNull();
  });

  test("密码确认(登录器损坏兜底)→ enabled:false", async () => {
    patchUser(1, { totp_secret: RFC_SECRET, totp_enabled: true });
    const { event } = await authedEvent({ body: { password: TEST_PASSWORD } });
    await expect(disableHandler(event)).resolves.toEqual({ enabled: false });
  });

  test("code 与 password 都错 → 400", async () => {
    patchUser(1, { totp_secret: RFC_SECRET, totp_enabled: true });
    const { event } = await authedEvent({ body: { code: "000000", password: "wrong" } });
    await expect(disableHandler(event)).rejects.toMatchObject({ statusCode: 400 });
  });
});

describe("2fa/disable.post:副作用", () => {
  test("停用时删除 trusted_device cookie", async () => {
    patchUser(1, { totp_secret: RFC_SECRET, totp_enabled: true });
    const { event, setCookies } = await authedEvent({ body: { password: TEST_PASSWORD }, cookie: "trusted_device=dev-live" });
    await disableHandler(event);
    // deleteCookie 走 Max-Age=0 / 过期
    const trust = setCookies.find(c => c.toLowerCase().startsWith("trusted_device="));
    expect(trust).toBeDefined();
    expect(trust).toMatch(/max-age=0|expires=thu, 01 jan 1970/i);
  });

  test("停用后 status 显示未启用且无 pendingSetup", async () => {
    patchUser(1, { totp_secret: RFC_SECRET, totp_enabled: true });
    const { event } = await authedEvent({ body: { password: TEST_PASSWORD } });
    await disableHandler(event);
    const status = (await import("#server/api/auth/2fa/status.get")).default;
    const { event: statusEv } = makeAuthEvent({ method: "GET", peer: nextIp(), cookie: await loginSessionCookie() });
    expect(await status(statusEv)).toEqual({ enabled: false, pendingSetup: false });
  });
});