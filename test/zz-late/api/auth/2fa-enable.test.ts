/**
 * server/api/auth/2fa/enable.post.ts 集成测:
 *  - 未登录 → 401
 *  - CSRF 缺失 → 403
 *  - code 非 6 位数字 → 400
 *  - 尚未 setup(无 totp_secret)→ 400 请先获取密钥
 *  - 动态码错误 → 400
 *  - 动态码正确 → enabled:true,DB totp_enabled 翻转
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
} from "#test/helpers/auth-fakes";
import { generateTOTPSecret } from "#server/utils/totp";
import { sharedFake } from "#test/helpers/fake-prisma";

const enableHandler = (await import("#server/api/auth/2fa/enable.post")).default;

let ipSeq = 0;
const nextIp = () => `10.20.4.${++ipSeq}`;

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

const RFC_SECRET = "GEZDGNBVGY3TQOJQGEZDGNBVGY3TQOJQ";

describe("2fa/enable.post:鉴权与基础校验", () => {
  test("未登录 → 401", async () => {
    const { event } = makeAuthEvent({ method: "POST", peer: nextIp(), body: { csrfToken: CSRF_TOKEN, code: "123456" } });
    await expect(enableHandler(event)).rejects.toMatchObject({ statusCode: 401 });
  });

  test("已登录但 CSRF 缺失 → 403", async () => {
    const session = await loginSessionCookie();
    const { event } = makeAuthEvent({ method: "POST", peer: nextIp(), cookie: session, body: { code: "123456" } });
    await expect(enableHandler(event)).rejects.toMatchObject({ statusCode: 403 });
  });

  test("code 非 6 位数字 → 400", async () => {
    patchUser(1, { totp_secret: RFC_SECRET });
    const { event } = await authedEvent({ body: { code: "12345" } });
    await expect(enableHandler(event)).rejects.toMatchObject({ statusCode: 400 });
  });

  test("尚未 setup(无 totp_secret)→ 400 请先获取密钥", async () => {
    const { event } = await authedEvent({ body: { code: "287082" } });
    await expect(enableHandler(event)).rejects.toMatchObject({ statusCode: 400, message: "请先获取两步验证密钥" });
  });
});

describe("2fa/enable.post:动态码校验", () => {
  test("动态码错误 → 400 动态验证码错误", async () => {
    patchUser(1, { totp_secret: RFC_SECRET });
    const { event } = await authedEvent({ body: { code: "000000" } });
    await expect(enableHandler(event)).rejects.toMatchObject({ statusCode: 400, message: "动态验证码错误，请重新输入" });
  });

  test("动态码正确 → enabled:true,DB totp_enabled 翻转为 true", async () => {
    const secret = generateTOTPSecret();
    patchUser(1, { totp_secret: secret });
    const { event } = await authedEvent({ body: { code: currentTotpCode(secret) } });
    const r = (await enableHandler(event)) as { enabled: boolean };
    expect(r).toEqual({ enabled: true });
    const db = await sharedFake.prisma.users.findUnique({ where: { uid: 1 }, select: { totp_enabled: true, totp_secret: true } });
    expect(db?.totp_enabled).toBe(true);
    expect(db?.totp_secret).toBe(secret);
  });

  test("±1 步窗内码也接受(时钟漂移)", async () => {
    const secret = generateTOTPSecret();
    patchUser(1, { totp_secret: secret });
    // 上一窗口的码
    const { event } = await authedEvent({ body: { code: currentTotpCode(secret, Date.now() - 30_000) } });
    await expect(enableHandler(event)).resolves.toEqual({ enabled: true });
  });
});