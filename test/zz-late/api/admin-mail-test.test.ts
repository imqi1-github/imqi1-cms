import { beforeEach, describe, expect, mock, test } from "bun:test";

import { CSRF_TOKEN, callAdmin, loginSessionCookie } from "#test/helpers/admin";
import { mockSharedPrisma } from "#test/helpers/fake-prisma";

mockSharedPrisma();

// mock mail.sendTestEmail:可控结果
let sentResult: { success: boolean; error?: string } = { success: true };
mock.module("#server/utils/mail", () => ({
  sendTestEmail: async () => sentResult,
}));

const handler = (await import("#server/api/admin/mail/test.post")).default;

beforeEach(() => { sentResult = { success: true }; });

describe("admin/mail/test.post(发送测试邮件)", () => {
  test("未登录 → 401", async () => {
    await expect(callAdmin(handler, {
      method: "POST",
      body: { csrfToken: CSRF_TOKEN, to: "test@example.com" },
      cookie: "csrf_token=" + CSRF_TOKEN,
    })).rejects.toMatchObject({ statusCode: 401 });
  });

  test("CSRF 缺失 → 403", async () => {
    const cookie = await loginSessionCookie();
    await expect(callAdmin(handler, {
      method: "POST",
      cookie,
      body: { to: "test@example.com" },
    })).rejects.toMatchObject({ statusCode: 403 });
  });

  test("to 缺省 → 400", async () => {
    const cookie = await loginSessionCookie();
    await expect(callAdmin(handler, {
      method: "POST",
      cookie: cookie + "; csrf_token=" + CSRF_TOKEN,
      body: { csrfToken: CSRF_TOKEN },
    })).rejects.toMatchObject({ statusCode: 400 });
  });

  test("成功 → 返回 sendTestEmail 结果", async () => {
    sentResult = { success: true };
    const cookie = await loginSessionCookie();
    const r = await callAdmin(handler, {
      method: "POST",
      cookie: cookie + "; csrf_token=" + CSRF_TOKEN,
      body: { csrfToken: CSRF_TOKEN, to: "test@example.com" },
    }) as { success: boolean };
    expect(r.success).toBe(true);
  });

  test("sendTestEmail 返回 success:false → 直接返回(不抛)", async () => {
    sentResult = { success: false, error: "SMTP 配置错误" };
    const cookie = await loginSessionCookie();
    const r = await callAdmin(handler, {
      method: "POST",
      cookie: cookie + "; csrf_token=" + CSRF_TOKEN,
      body: { csrfToken: CSRF_TOKEN, to: "test@example.com" },
    }) as { success: boolean };
    expect(r.success).toBe(false);
  });
});