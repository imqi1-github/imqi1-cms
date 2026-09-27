/**
 * 登录 → 2FA 完整链路集成测:
 *  - login.post → pending2FA + challenge
 *  - 2fa/verify.post → 校验 challenge + 动态码 → 建会话
 *  - challenge 非法 / code 非法 / 限流 / 用户中途关 2FA 边界
 *  - rememberDevice 路径(cookie + 入库 + 自定义 name)
 */
import "#test/helpers/nitro-globals";

import { beforeEach, describe, expect, test } from "bun:test";

import {
  CSRF_COOKIE,
  CSRF_TOKEN,
  cookieValue,
  currentTotpCode,
  makeAuthEvent,
  patchUser,
  resetTrustedDevices,
  resetUsers,
  TEST_PASSWORD,
} from "#test/helpers/auth-fakes";
import { generateTOTPSecret } from "#server/utils/totp";

const loginHandler = (await import("#server/api/auth/login.post")).default;
const verifyHandler = (await import("#server/api/auth/2fa/verify.post")).default;

let ipSeq = 0;
const nextIp = () => `10.20.2.${++ipSeq}`;

beforeEach(() => {
  resetUsers();
  resetTrustedDevices();
});

/** 用合法凭据 + 2FA-enabled 用户走 login,拿到 challenge */
async function startPending2FA(peer: string, secret: string): Promise<string> {
  patchUser(1, { totp_enabled: true, totp_secret: secret });
  const { event } = makeAuthEvent({
    method: "POST",
    peer,
    cookie: CSRF_COOKIE,
    body: { csrfToken: CSRF_TOKEN, username: "admin", password: TEST_PASSWORD },
  });
  const r = (await loginHandler(event)) as { pending2FA?: boolean; challenge?: string };
  if (!r.challenge) throw new Error("login 应下发 challenge");
  return r.challenge;
}

describe("login → 2fa/verify 完整链路", () => {
  test("动态码正确 → 建会话(httpOnly session cookie)", async () => {
    const peer = nextIp();
    const secret = generateTOTPSecret();
    const challenge = await startPending2FA(peer, secret);
    const { event, setCookies } = makeAuthEvent({
      method: "POST",
      peer,
      body: { challenge, code: currentTotpCode(secret) },
    });
    const r = (await verifyHandler(event)) as { success: boolean; user: Record<string, unknown> };
    expect(r.success).toBe(true);
    expect(Object.keys(r.user).sort()).toEqual(["avatar", "mail", "name", "nickname", "uid"]);
    expect(cookieValue(setCookies, "session")).toBeTruthy();
    expect(setCookies.join(";")).toMatch(/HttpOnly/i);
  });

  test("动态码错误 → 401(不建会话)", async () => {
    const peer = nextIp();
    const challenge = await startPending2FA(peer, "GEZDGNBVGY3TQOJQGEZDGNBVGY3TQOJQ");
    const { event, setCookies } = makeAuthEvent({
      method: "POST", peer, body: { challenge, code: "000000" },
    });
    await expect(verifyHandler(event)).rejects.toMatchObject({ statusCode: 401 });
    expect(cookieValue(setCookies, "session")).toBeUndefined();
  });

  test("challenge 非法 → 400 登录已过期", async () => {
    const { event } = makeAuthEvent({ method: "POST", peer: nextIp(), body: { challenge: "garbage", code: "123456" } });
    await expect(verifyHandler(event)).rejects.toMatchObject({
      statusCode: 400,
      message: "登录已过期，请重新登录",
    });
  });

  test("code 非 6 位数字 → 400", async () => {
    const { event } = makeAuthEvent({ method: "POST", peer: nextIp(), body: { challenge: "x", code: "abc12" } });
    await expect(verifyHandler(event)).rejects.toMatchObject({ statusCode: 400 });
  });

  test("challenge 有效但用户已关 2FA → 400 该账户未启用两步验证", async () => {
    const peer = nextIp();
    const challenge = await startPending2FA(peer, "GEZDGNBVGY3TQOJQGEZDGNBVGY3TQOJQ");
    patchUser(1, { totp_enabled: false, totp_secret: null });
    const { event } = makeAuthEvent({ method: "POST", peer, body: { challenge, code: "123456" } });
    await expect(verifyHandler(event)).rejects.toMatchObject({ statusCode: 400 });
  });

  test("该 IP 已限流 → 429(就算 challenge 与 code 都正确也先被拒)", async () => {
    const peer = nextIp();
    const { recordLoginFailure } = await import("#server/utils/login-rate-limit");
    for (let i = 0; i < 5; i++) await recordLoginFailure(peer);
    const { event, headers } = makeAuthEvent({
      method: "POST", peer, body: { challenge: "x", code: "123456" },
    });
    await expect(verifyHandler(event)).rejects.toMatchObject({ statusCode: 429 });
    expect(Number(headers["retry-after"])).toBeGreaterThan(0);
  });
});

describe("login → 2fa/verify:rememberDevice", () => {
  test("勾选 rememberDevice → 下发 trusted_device cookie + 入库(后续 verifyTrustedDevice 通过)", async () => {
    const peer = nextIp();
    const secret = generateTOTPSecret();
    const challenge = await startPending2FA(peer, secret);
    const { event, setCookies } = makeAuthEvent({
      method: "POST",
      peer,
      headers: { "user-agent": "Mozilla/5.0 Chrome/120.0" },
      body: { challenge, code: currentTotpCode(secret), rememberDevice: true },
    });
    await verifyHandler(event);
    const deviceId = cookieValue(setCookies, "trusted_device");
    expect(deviceId).toBeTruthy();
    const { verifyTrustedDevice } = await import("#server/utils/trusted-device");
    expect(await verifyTrustedDevice(deviceId!, 1)).toBe(true);
  });

  test("自定义 name → 入库时优先使用(UA 兜底被覆盖)", async () => {
    const peer = nextIp();
    const secret = generateTOTPSecret();
    const challenge = await startPending2FA(peer, secret);
    const { event } = makeAuthEvent({
      method: "POST", peer,
      headers: { "user-agent": "Mozilla/5.0 Chrome/120.0" },
      body: { challenge, code: currentTotpCode(secret), rememberDevice: true, name: "我的 MacBook" },
    });
    await verifyHandler(event);
    const rows = await import("#test/helpers/fake-prisma").then(m => m.sharedFake.prisma.trusted_devices.findMany({ where: { userId: 1 } })) as Array<{ name: string | null }>;
    expect(rows.some(r => r.name === "我的 MacBook")).toBe(true);
  });

  test("不勾选 rememberDevice → 不下发 trusted_device cookie", async () => {
    const peer = nextIp();
    const secret = generateTOTPSecret();
    const challenge = await startPending2FA(peer, secret);
    const { event, setCookies } = makeAuthEvent({
      method: "POST", peer,
      body: { challenge, code: currentTotpCode(secret) },
    });
    await verifyHandler(event);
    expect(cookieValue(setCookies, "trusted_device")).toBeUndefined();
  });
});