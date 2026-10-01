/**
 * server/api/auth/2fa/setup.post.ts 集成测:
 *  - 未登录 → 401
 *  - CSRF 缺失 → 403
 *  - 已登录 → 生成 base32 密钥 + otpauth URI + QR dataURL + enabled:false
 *  - 重复 setup → 覆盖旧密钥(轮换场景)
 */
import "#test/helpers/nitro-globals";

import { beforeEach, describe, expect, test } from "bun:test";

import { CSRF_TOKEN, loginSessionCookie, makeAuthEvent, patchUser, resetTrustedDevices, resetUsers } from "#test/helpers/auth-fakes";
import { sharedFake } from "#test/helpers/fake-prisma";
import { TEST_TOTP_ISSUER } from "#shared/constants";

const setupHandler = (await import("#server/api/auth/2fa/setup.post")).default;

let ipSeq = 0;
const nextIp = () => `10.20.3.${++ipSeq}`;

beforeEach(() => {
  resetUsers();
  resetTrustedDevices();
});

async function authedEvent(extra: { body?: Record<string, unknown> } = {}) {
  const session = await loginSessionCookie();
  return makeAuthEvent({
    method: "POST",
    peer: nextIp(),
    cookie: `${session}; csrf_token=${CSRF_TOKEN}`,
    body: { csrfToken: CSRF_TOKEN, ...extra.body },
  });
}

describe("2fa/setup.post:鉴权", () => {
  test("未登录 → 401", async () => {
    const { event } = makeAuthEvent({ method: "POST", peer: nextIp(), body: { csrfToken: CSRF_TOKEN } });
    await expect(setupHandler(event)).rejects.toMatchObject({ statusCode: 401 });
  });

  test("已登录但 CSRF 缺失 → 403", async () => {
    const session = await loginSessionCookie();
    const { event } = makeAuthEvent({ method: "POST", peer: nextIp(), cookie: session, body: {} });
    await expect(setupHandler(event)).rejects.toMatchObject({ statusCode: 403 });
  });
});

describe("2fa/setup.post:成功路径", () => {
  test("返回 base32 密钥 + otpauth URL + dataURL + enabled:false", async () => {
    const { event } = await authedEvent();
    const r = (await setupHandler(event)) as { enabled: boolean; secret: string; otpauthUrl: string; qrDataUrl: string };

    expect(r.enabled).toBe(false);
    expect(r.secret).toMatch(/^[A-Z2-7]{32}$/);
    expect(r.otpauthUrl).toMatch(/^otpauth:\/\/totp\//);
    expect(r.otpauthUrl).toContain(`secret=${r.secret}`);
    expect(r.otpauthUrl).toContain(`issuer=${TEST_TOTP_ISSUER}`);
    expect(r.qrDataUrl).toMatch(/^data:image\/png;base64,/);
  });

  test("密钥已写入 users.totp_secret,totp_enabled 仍为 false", async () => {
    const { event } = await authedEvent();
    const r = (await setupHandler(event)) as { secret: string };
    const db = await sharedFake.prisma.users.findUnique({ where: { uid: 1 }, select: { totp_secret: true, totp_enabled: true } });
    expect(db?.totp_secret).toBe(r.secret);
    expect(db?.totp_enabled).toBe(false);
  });

  test("重复 setup → 覆盖旧密钥(启用前的轮换场景)", async () => {
    const first = await authedEvent();
    const r1 = (await setupHandler(first.event)) as { secret: string };
    const second = await authedEvent();
    const r2 = (await setupHandler(second.event)) as { secret: string };
    expect(r1.secret).not.toBe(r2.secret);
    const db = await sharedFake.prisma.users.findUnique({ where: { uid: 1 }, select: { totp_secret: true } });
    expect(db?.totp_secret).toBe(r2.secret);
  });

  test("已有 totp_secret 但未 enable → setup 后 enabled 仍 false、pendingSetup 仍 true", async () => {
    patchUser(1, { totp_secret: "GEZDGNBVGY3TQOJQGEZDGNBVGY3TQOJQ", totp_enabled: false });
    const { event } = await authedEvent();
    const r = (await setupHandler(event)) as { enabled: boolean };
    expect(r.enabled).toBe(false);
    const status = (await import("#server/api/auth/2fa/status.get")).default;
    const { event: statusEv } = makeAuthEvent({
      method: "GET", peer: nextIp(), cookie: await loginSessionCookie(),
    });
    expect(await status(statusEv)).toEqual({ enabled: false, pendingSetup: true });
  });
});