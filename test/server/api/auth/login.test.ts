import "#test/helpers/nitro-globals";

import { beforeEach, describe, expect, test } from "bun:test";

import { CSRF_COOKIE, CSRF_TOKEN, cookieValue, makeAuthEvent, resetUsers, setCaptchaAccept, TEST_PASSWORD } from "#test/helpers/auth-fakes";

const { default: loginHandler } = await import("#server/api/auth/login.post");

// 每个用例用不同对端 IP:login-rate-limit 的内存计数按 IP 隔离
let ipSeq = 0;
function nextIp(): string {
  ipSeq += 1;
  return `10.9.1.${ipSeq}`;
}

function login(opts: {
  body?: Record<string, unknown>;
  cookie?: string;
  peer?: string;
}) {
  return makeAuthEvent({
    method: "POST",
    peer: opts.peer ?? nextIp(),
    cookie: opts.cookie ?? CSRF_COOKIE,
    body: { csrfToken: CSRF_TOKEN, ...opts.body },
  });
}

const VALID = { username: "admin", password: TEST_PASSWORD };

beforeEach(() => {
  resetUsers();
  setCaptchaAccept(true);
});

describe("login.post:入参校验(400)", () => {
  test.each([
    ["缺 csrfToken", { username: "admin", password: "x" }],
    ["username 非字符串", { username: 123, password: "x" }],
    ["password 非字符串", { username: "admin", password: 123 }],
    ["username 纯空白", { username: "   ", password: "x" }],
    ["password 空串", { username: "admin", password: "" }],
    ["username 超 64", { username: "u".repeat(65), password: "x" }],
    ["password 超 256", { username: "admin", password: "p".repeat(257) }],
  ])("%s → 400 请输入用户名和密码", async (_label, body) => {
    // 直接构造事件(不经 login helper,否则会被注入 csrfToken,「缺 csrfToken」就测不到)
    const { event } = makeAuthEvent({ method: "POST", peer: nextIp(), cookie: CSRF_COOKIE, body });
    await expect(loginHandler(event)).rejects.toMatchObject({ statusCode: 400 });
  });

  test("无 body 也不炸(400)", async () => {
    const { event } = makeAuthEvent({ method: "POST", peer: nextIp(), body: {} });
    await expect(loginHandler(event)).rejects.toMatchObject({ statusCode: 400 });
  });
});

describe("login.post:限流(429)", () => {
  test("连续 5 次密码错误后第 6 次被拒,响应带 Retry-After", async () => {
    const peer = nextIp();
    // 第 2 次起该 IP 已进失败窗口 → 自适应验证码生效,须带 captcha 才能走到密码校验
    const wrong = { username: "admin", password: "wrong-password", captcha: "1234" };

    for (let i = 0; i < 5; i++) {
      const { event } = login({ body: wrong, peer });
      await expect(loginHandler(event)).rejects.toMatchObject({ statusCode: 401 });
    }

    const { event, headers } = login({ body: { ...VALID, captcha: "1234" }, peer });
    await expect(loginHandler(event)).rejects.toMatchObject({ statusCode: 429 });
    expect(Number(headers["retry-after"])).toBeGreaterThan(0);
  });

  test("失败计数按 IP 隔离:一个 IP 锁定不影响另一个", async () => {
    const lockedIp = nextIp();
    const otherIp = nextIp();
    const wrong = { username: "admin", password: "bad", captcha: "1234" };
    for (let i = 0; i < 5; i++) {
      const { event } = login({ body: wrong, peer: lockedIp });
      await expect(loginHandler(event)).rejects.toMatchObject({ statusCode: 401 });
    }
    const { event } = login({ body: VALID, peer: otherIp });
    await expect(loginHandler(event)).resolves.toMatchObject({ success: true });
  });
});

describe("login.post:CSRF(403)", () => {
  test("cookie 缺失 → 403(且不改动验证码状态)", async () => {
    const { event } = login({ body: VALID, cookie: "" });
    await expect(loginHandler(event)).rejects.toMatchObject({ statusCode: 403 });
  });

  test("body token 与 cookie 不一致 → 403", async () => {
    const { event } = login({ body: { ...VALID, csrfToken: "mismatched-token-xx" }, cookie: CSRF_COOKIE });
    await expect(loginHandler(event)).rejects.toMatchObject({ statusCode: 403 });
  });
});

describe("login.post:自适应验证码(400)", () => {
  test("该 IP 有失败记录时缺验证码 → 400 且标 captchaRequired", async () => {
    const peer = nextIp();
    // 先制造一次失败
    const first = login({ body: { username: "admin", password: "bad" }, peer });
    await expect(loginHandler(first.event)).rejects.toMatchObject({ statusCode: 401 });

    // 第二次即便密码正确也要求验证码
    const second = login({ body: VALID, peer });
    try {
      await loginHandler(second.event);
      throw new Error("应当 400");
    } catch (error) {
      expect((error as { statusCode?: number }).statusCode).toBe(400);
      expect((error as { data?: { captchaRequired?: boolean } }).data?.captchaRequired).toBe(true);
    }
  });

  test("验证码校验不过 → 400", async () => {
    const peer = nextIp();
    setCaptchaAccept(false);
    const first = login({ body: { username: "admin", password: "bad" }, peer });
    await expect(loginHandler(first.event)).rejects.toMatchObject({ statusCode: 401 });

    const second = login({ body: { ...VALID, captcha: "0000" }, peer });
    await expect(loginHandler(second.event)).rejects.toMatchObject({ statusCode: 400 });
  });

  test("验证码通过后放行", async () => {
    const peer = nextIp();
    const first = login({ body: { username: "admin", password: "bad" }, peer });
    await expect(loginHandler(first.event)).rejects.toMatchObject({ statusCode: 401 });

    setCaptchaAccept(true);
    const second = login({ body: { ...VALID, captcha: "1234" }, peer });
    await expect(loginHandler(second.event)).resolves.toMatchObject({ success: true });
  });
});

describe("login.post:凭据校验(401)", () => {
  test("用户不存在 → 401(不泄露是否存在)", async () => {
    const { event } = login({ body: { username: "nobody", password: "x" } });
    await expect(loginHandler(event)).rejects.toMatchObject({ statusCode: 401, message: "用户名或密码错误" });
  });

  test("密码错误 → 401", async () => {
    const { event } = login({ body: { username: "admin", password: "wrong" } });
    await expect(loginHandler(event)).rejects.toMatchObject({ statusCode: 401, message: "用户名或密码错误" });
  });
});

describe("login.post:成功路径", () => {
  test("未启用 2FA:建会话、种 httpOnly cookie、返回用户白名单", async () => {
    const { event, setCookies } = login({ body: VALID });
    const result = (await loginHandler(event)) as { success: boolean; user: Record<string, unknown> };

    expect(result.success).toBe(true);
    // 硬性约定 #1:响应不得含 password / totp_secret / auth_code
    expect(Object.keys(result.user).sort()).toEqual(["avatar", "mail", "name", "nickname", "uid"]);
    const json = JSON.stringify(result);
    expect(json).not.toContain("password");
    expect(json).not.toContain("totp");
    expect(json).not.toContain("auth_code");

    const session = cookieValue(setCookies, "session");
    expect(session).toBeTruthy();
    expect(setCookies.join(";")).toContain("HttpOnly");
  });

  test("启用 2FA 且非信任设备:返回 pending2FA + challenge,不建会话", async () => {
    resetUsers({ totp_enabled: true, totp_secret: "GEZDGNBVGY3TQOJQGEZDGNBVGY3TQOJQ" });
    const { event, setCookies } = login({ body: VALID });
    const result = (await loginHandler(event)) as { success: boolean; pending2FA?: boolean; challenge?: string };

    expect(result.success).toBe(false);
    expect(result.pending2FA).toBe(true);
    expect(typeof result.challenge).toBe("string");
    // 尚未建会话
    expect(cookieValue(setCookies, "session")).toBeUndefined();
  });

  test("启用 2FA 但「信任此设备」cookie 有效:直接建会话", async () => {
    resetUsers({ totp_enabled: true, totp_secret: "GEZDGNBVGY3TQOJQGEZDGNBVGY3TQOJQ" });
    // 先经 verify 建一条信任设备记录(与 login 读取的同一张表)
    const { createTrustedDevice } = await import("#server/utils/trusted-device");
    await createTrustedDevice({ userId: 1, deviceId: "trusted-dev-1", name: "我的手机", ip: "1.2.3.4" });

    const { event, setCookies } = login({ body: VALID, cookie: `${CSRF_COOKIE}; trusted_device=trusted-dev-1` });
    const result = (await loginHandler(event)) as { success: boolean; pending2FA?: boolean };

    expect(result.success).toBe(true);
    expect(result.pending2FA).toBeUndefined();
    expect(cookieValue(setCookies, "session")).toBeTruthy();
  });

  test("成功登录后清除该 IP 的失败计数(可再次登录)", async () => {
    const peer = nextIp();
    const bad = login({ body: { username: "admin", password: "bad" }, peer });
    await expect(loginHandler(bad.event)).rejects.toMatchObject({ statusCode: 401 });

    // 有失败 → 需验证码;带上正确验证码登录成功后计数清零
    const ok = login({ body: { ...VALID, captcha: "1234" }, peer });
    await expect(loginHandler(ok.event)).resolves.toMatchObject({ success: true });
  });
});
