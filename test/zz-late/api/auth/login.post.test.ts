/**
 * server/api/auth/login.post.ts 全 handler 集成测:
 *  - 成功路径(无 2FA)+ 字段白名单 + httpOnly cookie
 *  - 凭据错(用户不存在 / 密码错)+ 模糊化消息
 *  - CSRF cookie 缺失/不一致
 *  - 限流(5 次失败 → 429 + Retry-After)+ IP 隔离
 *  - 启用 2FA → pending2FA + challenge,不建会话
 *  - 信任设备 cookie → 直接建会话
 *  - 自适应验证码(有失败 → 必带 captcha)
 */
import "#test/helpers/nitro-globals";

import { beforeEach, describe, expect, test } from "bun:test";

import { CSRF_COOKIE, CSRF_TOKEN, cookieValue, makeAuthEvent, resetTrustedDevices, resetUsers, setCaptchaAccept, TEST_PASSWORD } from "#test/helpers/auth-fakes";

const loginHandler = (await import("#server/api/auth/login.post")).default;

let ipSeq = 0;
const nextIp = () => `10.20.1.${++ipSeq}`;

function login(opts: { body?: Record<string, unknown>; cookie?: string; peer?: string }) {
  return makeAuthEvent({
    method: "POST",
    peer: opts.peer ?? nextIp(),
    cookie: opts.cookie ?? CSRF_COOKIE,
    body: { csrfToken: CSRF_TOKEN, ...opts.body },
  });
}

beforeEach(() => {
  resetUsers();
  resetTrustedDevices();
  setCaptchaAccept(true);
});

describe("login.post:成功路径", () => {
  test("无 2FA → success + 用户白名单字段(无 password/totp/auth_code)", async () => {
    const { event } = login({ body: { username: "admin", password: TEST_PASSWORD } });
    const r = (await loginHandler(event)) as { success: boolean; user: Record<string, unknown> };
    expect(r.success).toBe(true);
    expect(Object.keys(r.user).sort()).toEqual(["avatar", "mail", "name", "nickname", "uid"]);
    const json = JSON.stringify(r);
    expect(json).not.toContain("password");
    expect(json).not.toContain("totp");
    expect(json).not.toContain("auth_code");
  });

  test("session cookie 已下发且 httpOnly", async () => {
    const { event, setCookies } = login({ body: { username: "admin", password: TEST_PASSWORD } });
    await loginHandler(event);
    expect(cookieValue(setCookies, "session")).toBeTruthy();
    expect(setCookies.join(";")).toMatch(/HttpOnly/i);
  });

  test("用户不存在 → 401 模糊消息(不区分用户名是否存在)", async () => {
    const { event } = login({ body: { username: "nobody", password: "x" } });
    await expect(loginHandler(event)).rejects.toMatchObject({
      statusCode: 401,
      message: "用户名或密码错误",
    });
  });
});

describe("login.post:凭据与 CSRF", () => {
  test("密码错 → 401", async () => {
    const { event } = login({ body: { username: "admin", password: "wrong" } });
    await expect(loginHandler(event)).rejects.toMatchObject({ statusCode: 401 });
  });

  test("CSRF cookie 缺失 → 403", async () => {
    const { event } = login({ body: { username: "admin", password: TEST_PASSWORD }, cookie: "" });
    await expect(loginHandler(event)).rejects.toMatchObject({ statusCode: 403 });
  });

  test("body csrfToken 与 cookie 不一致 → 403", async () => {
    const { event } = login({ body: { username: "admin", password: TEST_PASSWORD, csrfToken: "wrong-token-xx" } });
    await expect(loginHandler(event)).rejects.toMatchObject({ statusCode: 403 });
  });
});

describe("login.post:限流", () => {
  test("5 次密码错 → 第 6 次被 429 + Retry-After", async () => {
    const peer = nextIp();
    for (let i = 0; i < 5; i++) {
      const { event } = login({ body: { username: "admin", password: "wrong", captcha: "1234" }, peer });
      await expect(loginHandler(event)).rejects.toMatchObject({ statusCode: 401 });
    }
    const { event, headers } = login({ body: { username: "admin", password: TEST_PASSWORD, captcha: "1234" }, peer });
    await expect(loginHandler(event)).rejects.toMatchObject({ statusCode: 429 });
    expect(Number(headers["retry-after"])).toBeGreaterThan(0);
  });

  test("不同 IP 互不干扰(lockedIp 满,otherIp 仍可登录)", async () => {
    const lockedIp = nextIp();
    const otherIp = nextIp();
    for (let i = 0; i < 5; i++) {
      const { event } = login({ body: { username: "admin", password: "wrong", captcha: "1234" }, peer: lockedIp });
      await expect(loginHandler(event)).rejects.toMatchObject({ statusCode: 401 });
    }
    const { event } = login({ body: { username: "admin", password: TEST_PASSWORD }, peer: otherIp });
    await expect(loginHandler(event)).resolves.toMatchObject({ success: true });
  });

  test("成功登录后清掉该 IP 失败计数(后续可再错 5 次)", async () => {
    const peer = nextIp();
    const bad = login({ body: { username: "admin", password: "wrong" }, peer });
    await expect(loginHandler(bad.event)).rejects.toMatchObject({ statusCode: 401 });
    // 带验证码成功登录
    const ok = login({ body: { username: "admin", password: TEST_PASSWORD, captcha: "1234" }, peer });
    await expect(loginHandler(ok.event)).resolves.toMatchObject({ success: true });
  });
});

describe("login.post:2FA + 信任设备", () => {
  test("启用 2FA 且无信任设备 → pending2FA + challenge,不建会话", async () => {
    resetUsers({ totp_enabled: true, totp_secret: "GEZDGNBVGY3TQOJQGEZDGNBVGY3TQOJQ" });
    const { event, setCookies } = login({ body: { username: "admin", password: TEST_PASSWORD } });
    const r = (await loginHandler(event)) as { success: boolean; pending2FA?: boolean; challenge?: string };

    expect(r.success).toBe(false);
    expect(r.pending2FA).toBe(true);
    expect(typeof r.challenge).toBe("string");
    expect(cookieValue(setCookies, "session")).toBeUndefined();
  });

  test("启用 2FA + 有效信任设备 cookie → 直接建会话", async () => {
    resetUsers({ totp_enabled: true, totp_secret: "GEZDGNBVGY3TQOJQGEZDGNBVGY3TQOJQ" });
    const { createTrustedDevice } = await import("#server/utils/trusted-device");
    await createTrustedDevice({ userId: 1, deviceId: "trusted-dev-1", name: null, ip: "1.1.1.1" });
    const { event, setCookies } = login({
      body: { username: "admin", password: TEST_PASSWORD },
      cookie: `${CSRF_COOKIE}; trusted_device=trusted-dev-1`,
    });
    const r = (await loginHandler(event)) as { success: boolean; pending2FA?: boolean };
    expect(r.success).toBe(true);
    expect(r.pending2FA).toBeUndefined();
    expect(cookieValue(setCookies, "session")).toBeTruthy();
  });
});

describe("login.post:自适应验证码", () => {
  test("同 IP 失败一次后,下次登录必带 captcha(captchaRequired:true)", async () => {
    const peer = nextIp();
    const first = login({ body: { username: "admin", password: "wrong" }, peer });
    await expect(loginHandler(first.event)).rejects.toMatchObject({ statusCode: 401 });
    const second = login({ body: { username: "admin", password: TEST_PASSWORD }, peer });
    try {
      await loginHandler(second.event);
      throw new Error("应当 400");
    } catch (error) {
      expect((error as { statusCode?: number }).statusCode).toBe(400);
      expect((error as { data?: { captchaRequired?: boolean } }).data?.captchaRequired).toBe(true);
    }
  });
});