import "#test/helpers/nitro-globals";

import { createHmac } from "node:crypto";

import { beforeEach, describe, expect, test } from "bun:test";

import { CSRF_COOKIE, CSRF_TOKEN, cookieValue, loginSessionCookie, makeAuthEvent, patchUser, resetUsers, resetTrustedDevices, TEST_PASSWORD } from "#test/helpers/auth-fakes";
import { generateTOTPSecret } from "#server/utils/totp";

const setupHandler = (await import("#server/api/auth/2fa/setup.post")).default;
const enableHandler = (await import("#server/api/auth/2fa/enable.post")).default;
const disableHandler = (await import("#server/api/auth/2fa/disable.post")).default;
const statusHandler = (await import("#server/api/auth/2fa/status.get")).default;
const verify2faHandler = (await import("#server/api/auth/2fa/verify.post")).default;
const loginHandler = (await import("#server/api/auth/login.post")).default;

const RFC_SECRET = "GEZDGNBVGY3TQOJQGEZDGNBVGY3TQOJQ";

// 测试内独立实现 TOTP(RFC 6238),为当前时刻确定性算出有效码 ——
// 不与被测实现共用代码,避免「实现错了一起错」,也免去试探候选码的脆弱写法
const B32 = "ABCDEFGHIJKLMNOPQRSTUVWXYZ234567";
function base32Decode(input: string): Buffer {
  let bits = 0;
  let value = 0;
  const out: number[] = [];
  for (const ch of input.toUpperCase().replace(/[=\s]/g, "")) {
    const v = B32.indexOf(ch);
    if (v < 0) throw new Error(`bad base32 char: ${ch}`);
    value = (value << 5) | v;
    bits += 5;
    if (bits >= 8) {
      out.push((value >>> (bits - 8)) & 0xff);
      bits -= 8;
    }
  }
  return Buffer.from(out);
}

/** 计算 secret 在 atMs 时刻的 6 位 TOTP 码 */
function totpCodeAt(secret: string, atMs: number): string {
  const counter = Math.floor(atMs / 1000 / 30);
  const msg = Buffer.alloc(8);
  msg.writeBigUInt64BE(BigInt(counter));
  const hmac = createHmac("sha1", base32Decode(secret)).update(msg).digest();
  const offset = (hmac[hmac.length - 1] ?? 0) & 0x0f;
  const code =
    (((hmac[offset] ?? 0) & 0x7f) << 24) |
    ((hmac[offset + 1] ?? 0) << 16) |
    ((hmac[offset + 2] ?? 0) << 8) |
    (hmac[offset + 3] ?? 0);
  return (code % 1_000_000).toString().padStart(6, "0");
}

let ipSeq = 0;
const nextIp = () => `10.9.3.${++ipSeq}`;

beforeEach(() => {
  resetUsers();
  resetTrustedDevices();
});

async function authedEvent(extra: { body?: unknown; cookie?: string; peer?: string } = {}) {
  const session = await loginSessionCookie();
  return makeAuthEvent({
    method: "POST",
    peer: extra.peer ?? nextIp(),
    cookie: `${session}; ${CSRF_COOKIE}${extra.cookie ? `; ${extra.cookie}` : ""}`,
    body: { csrfToken: CSRF_TOKEN, ...(extra.body as Record<string, unknown> ?? {}) },
  });
}

describe("2fa/status.get", () => {
  test("未登录 → 401", async () => {
    const { event } = makeAuthEvent({ method: "GET", peer: nextIp() });
    await expect(statusHandler(event)).rejects.toMatchObject({ statusCode: 401 });
  });

  test("未开启:{enabled:false, pendingSetup:false}", async () => {
    const session = await loginSessionCookie();
    const { event } = makeAuthEvent({ method: "GET", cookie: session, peer: nextIp() });
    expect(await statusHandler(event)).toEqual({ enabled: false, pendingSetup: false });
  });

  test("已存密钥未确认:pendingSetup=true;已开启:enabled=true", async () => {
    const session = await loginSessionCookie();
    patchUser(1, { totp_secret: RFC_SECRET, totp_enabled: false });
    const pending = makeAuthEvent({ method: "GET", cookie: session, peer: nextIp() });
    expect(await statusHandler(pending.event)).toEqual({ enabled: false, pendingSetup: true });

    patchUser(1, { totp_enabled: true });
    const on = makeAuthEvent({ method: "GET", cookie: session, peer: nextIp() });
    expect(await statusHandler(on.event)).toEqual({ enabled: true, pendingSetup: false });
  });
});

describe("2fa/setup.post", () => {
  test("未登录 → 401;CSRF 失败 → 403", async () => {
    const anon = makeAuthEvent({ method: "POST", peer: nextIp(), body: { csrfToken: CSRF_TOKEN } });
    await expect(setupHandler(anon.event)).rejects.toMatchObject({ statusCode: 401 });

    const session = await loginSessionCookie();
    const noCsrf = makeAuthEvent({ method: "POST", cookie: session, peer: nextIp(), body: {} });
    await expect(setupHandler(noCsrf.event)).rejects.toMatchObject({ statusCode: 403 });
  });

  test("生成密钥并暂存,返回 otpauth URI 与二维码 dataURL", async () => {
    const { event } = await authedEvent();
    const r = (await setupHandler(event)) as { enabled: boolean; secret: string; otpauthUrl: string; qrDataUrl: string };

    expect(r.enabled).toBe(false);
    expect(r.secret).toMatch(/^[A-Z2-7]{32}$/);
    expect(r.otpauthUrl).toContain(`secret=${r.secret}`);
    expect(r.otpauthUrl).toContain("issuer=imqi1");
    expect(r.qrDataUrl).toMatch(/^data:image\/png;base64,/);
  });
});

describe("2fa/enable.post", () => {
  test("动态码格式非法 → 400", async () => {
    patchUser(1, { totp_secret: RFC_SECRET });
    const { event } = await authedEvent({ body: { code: "12345" } });
    await expect(enableHandler(event)).rejects.toMatchObject({ statusCode: 400 });
  });

  test("尚未获取密钥 → 400 请先获取密钥", async () => {
    const { event } = await authedEvent({ body: { code: "287082" } });
    await expect(enableHandler(event)).rejects.toMatchObject({ statusCode: 400 });
  });

  test("动态码错误 → 400;正确 → 启用", async () => {
    patchUser(1, { totp_secret: RFC_SECRET });
    const wrong = await authedEvent({ body: { code: "000000" } });
    await expect(enableHandler(wrong.event)).rejects.toMatchObject({ statusCode: 400 });

    const ok = await authedEvent({ body: { code: totpCodeAt(RFC_SECRET, Date.now()) } });
    await expect(enableHandler(ok.event)).resolves.toEqual({ enabled: true });
  });

  test("enable 成功后 status 显示已开启", async () => {
    const secret = generateTOTPSecret();
    patchUser(1, { totp_secret: secret });
    const { event } = await authedEvent({ body: { code: totpCodeAt(secret, Date.now()) } });
    await expect(enableHandler(event)).resolves.toEqual({ enabled: true });

    const session = await loginSessionCookie();
    const status = makeAuthEvent({ method: "GET", cookie: session, peer: nextIp() });
    expect(await statusHandler(status.event)).toEqual({ enabled: true, pendingSetup: false });
  });
});

describe("2fa/disable.post", () => {
  test("未开启 → 400;密码确认可停用;动态码确认亦可", async () => {
    // 未开启
    const { event } = await authedEvent({ body: { code: "287082" } });
    await expect(disableHandler(event)).rejects.toMatchObject({ statusCode: 400 });

    // 密码确认(登录器损坏时的回退路径)
    patchUser(1, { totp_secret: RFC_SECRET, totp_enabled: true });
    const byPw = await authedEvent({ body: { password: TEST_PASSWORD } });
    await expect(disableHandler(byPw.event)).resolves.toEqual({ enabled: false });

    // 重新开启后动态码确认
    patchUser(1, { totp_secret: RFC_SECRET, totp_enabled: true });
    const byCode = await authedEvent({ body: { code: totpCodeAt(RFC_SECRET, Date.now()) } });
    await expect(disableHandler(byCode.event)).resolves.toEqual({ enabled: false });
  });

  test("确认信息错误 → 400", async () => {
    patchUser(1, { totp_secret: RFC_SECRET, totp_enabled: true });
    const { event } = await authedEvent({ body: { code: "000000", password: "wrong" } });
    await expect(disableHandler(event)).rejects.toMatchObject({ statusCode: 400 });
  });

  test("停用会清掉「信任此设备」cookie", async () => {
    patchUser(1, { totp_secret: RFC_SECRET, totp_enabled: true });
    const { event, setCookies } = await authedEvent({ body: { password: TEST_PASSWORD }, cookie: "trusted_device=dev-live" });
    await disableHandler(event);
    expect(setCookies.join(";")).toContain("trusted_device=;");
  });
});

describe("2fa/verify.post(登录第二因素)", () => {
  async function challengeFor(peer: string): Promise<string> {
    const { event } = makeAuthEvent({
      method: "POST",
      peer,
      cookie: CSRF_COOKIE,
      body: { csrfToken: CSRF_TOKEN, username: "admin", password: "correct-horse" },
    });
    const r = (await loginHandler(event)) as { pending2FA?: boolean; challenge?: string };
    return r.challenge!;
  }

  test("参数格式非法 → 400", async () => {
    const { event } = makeAuthEvent({ method: "POST", peer: nextIp(), body: { challenge: "x", code: "12" } });
    await expect(verify2faHandler(event)).rejects.toMatchObject({ statusCode: 400 });
  });

  test("challenge 无效/过期 → 400 登录已过期", async () => {
    const { event } = makeAuthEvent({ method: "POST", peer: nextIp(), body: { challenge: "not-a-token", code: "287082" } });
    await expect(verify2faHandler(event)).rejects.toMatchObject({ statusCode: 400 });
  });

  test("该账户未启用 2FA → 400", async () => {
    const peer = nextIp();
    patchUser(1, { totp_enabled: true, totp_secret: RFC_SECRET });
    const challenge = await challengeFor(peer);
    // 拿到 challenge 后关掉 2FA
    patchUser(1, { totp_enabled: false });
    const { event } = makeAuthEvent({ method: "POST", peer, body: { challenge, code: "287082" } });
    await expect(verify2faHandler(event)).rejects.toMatchObject({ statusCode: 400 });
  });

  test("动态码错误 → 401", async () => {
    const peer = nextIp();
    patchUser(1, { totp_enabled: true, totp_secret: RFC_SECRET });
    const challenge = await challengeFor(peer);
    const { event } = makeAuthEvent({ method: "POST", peer, body: { challenge, code: "000000" } });
    await expect(verify2faHandler(event)).rejects.toMatchObject({ statusCode: 401 });
  });

  test("动态码正确 → 建会话;rememberDevice 时下发信任设备 cookie", async () => {
    const peer = nextIp();
    const secret = generateTOTPSecret();
    patchUser(1, { totp_enabled: true, totp_secret: secret });
    const challenge = await challengeFor(peer);
    const code = totpCodeAt(secret, Date.now());

    const { event, setCookies } = makeAuthEvent({
      method: "POST",
      peer,
      headers: { "user-agent": "Mozilla/5.0 Chrome/120.0" },
      body: { challenge, code, rememberDevice: true },
    });
    const r = (await verify2faHandler(event)) as { success: boolean; user: Record<string, unknown> };

    expect(r.success).toBe(true);
    expect(Object.keys(r.user).sort()).toEqual(["avatar", "mail", "name", "nickname", "uid"]);
    expect(cookieValue(setCookies, "session")).toBeTruthy();
    const deviceId = cookieValue(setCookies, "trusted_device");
    expect(deviceId).toBeTruthy();
    // 信任设备已入库(后续登录可免 2FA)
    const { verifyTrustedDevice } = await import("#server/utils/trusted-device");
    expect(await verifyTrustedDevice(deviceId!, 1)).toBe(true);
  });

  test("该 IP 被限流时 → 429", async () => {
    const peer = nextIp();
    patchUser(1, { totp_enabled: true, totp_secret: RFC_SECRET });
    const { recordLoginFailure } = await import("#server/utils/login-rate-limit");
    for (let i = 0; i < 5; i++) await recordLoginFailure(peer);

    const { event } = makeAuthEvent({ method: "POST", peer, body: { challenge: "x", code: "287082" } });
    await expect(verify2faHandler(event)).rejects.toMatchObject({ statusCode: 429 });
  });
});
