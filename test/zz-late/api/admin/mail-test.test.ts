import { describe, expect, mock, test } from "bun:test";

import { CSRF_COOKIE, CSRF_TOKEN, callAdmin, loginSessionCookie } from "#test/helpers/admin";

mock.module("#server/utils/mail", () => ({
  sendTestEmail: async (to: string) => ({
    success: true,
    message: `测试邮件已发送至 ${to}`,
  }),
}));

const mailTestHandler = (await import("#server/api/admin/mail/test.post")).default;

async function cookie() {
  return `${await loginSessionCookie()}; ${CSRF_COOKIE}`;
}

describe("mail/test.post(发送测试邮件)", () => {
  test("未登录 → 401", async () => {
    await expect(callAdmin(mailTestHandler, {
      method: "POST",
      cookie: CSRF_COOKIE,
      body: { csrfToken: CSRF_TOKEN, to: "x@y.com" },
    })).rejects.toMatchObject({ statusCode: 401 });
  });

  test("CSRF 缺失 → 403", async () => {
    await expect(callAdmin(mailTestHandler, {
      method: "POST",
      body: { to: "x@y.com" },
      cookie: await cookie(),
    })).rejects.toMatchObject({ statusCode: 403 });
  });

  test("to 缺省 → 400 请提供收件人邮箱", async () => {
    await expect(callAdmin(mailTestHandler, {
      method: "POST",
      body: { csrfToken: CSRF_TOKEN },
      cookie: await cookie(),
    })).rejects.toThrow(/请提供收件人/);
  });

  test("提供 to → 调用 sendTestEmail 返回 success", async () => {
    const r = await callAdmin(mailTestHandler, {
      method: "POST",
      body: { csrfToken: CSRF_TOKEN, to: "admin@x.com" },
      cookie: await cookie(),
    }) as { success: boolean, message: string };
    expect(r.success).toBe(true);
    expect(r.message).toContain("admin@x.com");
  });
});
