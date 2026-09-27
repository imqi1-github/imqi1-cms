/**
 * server/api/admin/mail/test.post.ts 集成测:
 *  - 补 csrf / to 缺省 / 透传至 sendTestEmail 异常 / SMTP 错误不外泄
 *  - mail util 整体 mock(真实 SMTP 不在 CI 跑)
 */
import { afterEach, beforeEach, describe, expect, mock, test } from "bun:test";

import { callAdmin, loginSessionCookie } from "#test/helpers/admin";
import { CSRF_COOKIE, CSRF_TOKEN } from "#test/helpers/auth-fakes";
import { CSRF_HEADER } from "#shared/constants";

const sendImpl = mock(async (_to: string) => ({ ok: true as const }));
mock.module("#server/utils/mail", () => ({ sendTestEmail: sendImpl }));

const handler = (await import("#server/api/admin/mail/test.post")).default;

beforeEach(() => {
  sendImpl.mockReset();
  sendImpl.mockResolvedValue({ ok: true });
});
afterEach(() => {
  sendImpl.mockReset();
});

// POST 需要 csrf_token cookie;loginSessionCookie 只塞 session,这里组合一份
async function authedCookie(): Promise<string> {
  const session = await loginSessionCookie();
  return `${session}; ${CSRF_COOKIE}`;
}

describe("admin/mail/test.post(发送测试邮件)", () => {
  test("未登录 → 401", async () => {
    await expect(callAdmin(handler, {
      method: "POST",
      body: { csrfToken: CSRF_TOKEN, to: "x@y.z" },
    })).rejects.toMatchObject({ statusCode: 401 });
  });

  test("CSRF 失败 → 403", async () => {
    const session = await loginSessionCookie();
    const cookie = `${session}; csrf_token=wrong-token`;
    await expect(callAdmin(handler, {
      method: "POST", cookie,
      headers: { [CSRF_HEADER]: CSRF_TOKEN },
      body: { csrfToken: CSRF_TOKEN, to: "x@y.z" },
    })).rejects.toMatchObject({ statusCode: 403 });
  });

  test("to/adminEmail 均缺 → 400", async () => {
    const cookie = await authedCookie();
    await expect(callAdmin(handler, {
      method: "POST", cookie,
      body: { csrfToken: CSRF_TOKEN },
    })).rejects.toMatchObject({ statusCode: 400, message: "请提供收件人邮箱" });
  });

  test("body.to 优先于 adminEmail", async () => {
    const cookie = await authedCookie();
    await callAdmin(handler, {
      method: "POST", cookie,
      body: { csrfToken: CSRF_TOKEN, to: "first@y.z", adminEmail: "second@y.z" },
    });
    expect(sendImpl).toHaveBeenCalledWith("first@y.z");
  });

  test("fallback: 仅有 adminEmail → 走 adminEmail", async () => {
    const cookie = await authedCookie();
    await callAdmin(handler, {
      method: "POST", cookie,
      body: { csrfToken: CSRF_TOKEN, adminEmail: "second@y.z" },
    });
    expect(sendImpl).toHaveBeenCalledWith("second@y.z");
  });

  test("SMTP 错误被吞成 500,不把底层错误(message 可能含主机/端口/凭证)直传客户端", async () => {
    sendImpl.mockRejectedValueOnce(new Error("connect ECONNREFUSED smtp.gmail.com:465"));
    const cookie = await authedCookie();
    await expect(callAdmin(handler, {
      method: "POST", cookie,
      body: { csrfToken: CSRF_TOKEN, to: "x@y.z" },
    })).rejects.toMatchObject({ statusCode: 500 });
  });

  test("sendTestEmail 抛 statusCode 错误 → 原样上抛(非一律 500)", async () => {
    sendImpl.mockRejectedValueOnce(Object.assign(new Error("rate-limited"), { statusCode: 429 }));
    const cookie = await authedCookie();
    await expect(callAdmin(handler, {
      method: "POST", cookie,
      body: { csrfToken: CSRF_TOKEN, to: "x@y.z" },
    })).rejects.toMatchObject({ statusCode: 429 });
  });
});