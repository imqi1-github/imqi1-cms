/**
 * 依赖故障覆盖：admin/mail/test.post / admin/contents.get 等
 *
 * 关键不变量：
 * - SMTP/Prisma 抛错时 catch 必须兜底成 500，且不能把底层错误消息
 *   （含 host/port/认证信息、SQL 详情）直接传给客户端。
 * - 已有 4xx 的错误原样抛（CSRF 401/403/400）不被 catch 吞成 500。
 *
 * 放 zz-late/：依赖 mock.module 覆盖 server 工具模块。
 */
import { describe, expect, mock, test } from "bun:test";

import { CSRF_TOKEN, callAdmin, loginSessionCookie } from "#test/helpers/admin";
import { mockSharedPrisma, sharedFake } from "#test/helpers/fake-prisma";

mockSharedPrisma();

const mailHandler = (await import("#server/api/admin/mail/test.post")).default;
const contentsHandler = (await import("#server/api/admin/contents.get")).default;

async function callMail(body: Record<string, unknown>) {
  const cookie = await loginSessionCookie();
  return callAdmin(mailHandler, {
    method: "POST",
    cookie: cookie + "; csrf_token=" + CSRF_TOKEN,
    body: { csrfToken: CSRF_TOKEN, ...body },
  });
}

async function callContents() {
  const cookie = await loginSessionCookie();
  return callAdmin(contentsHandler, {
    method: "GET",
    cookie: cookie + "; csrf_token=" + CSRF_TOKEN,
  });
}

describe("admin/mail/test.post SMTP 故障隔离", () => {
  test("SMTP 连接拒绝 → 500 + 不泄漏 ECONNREFUSED/host:port", async () => {
    mock.module("#server/utils/mail", () => ({
      sendTestEmail: async () => {
        const e = new Error("connect ECONNREFUSED 127.0.0.1:587") as Error & { code?: string };
        e.code = "ECONNREFUSED";
        throw e;
      },
    }));
    const err = await callMail({ to: "test@example.com" }).catch((e: unknown) => e as { statusCode?: number; message?: string }) as unknown as { statusCode?: number; message?: string };
    expect(err.statusCode).toBe(500);
    expect(String(err.message)).not.toMatch(/ECONNREFUSED/);
    expect(String(err.message)).not.toMatch(/127\.0\.0\.1/);
    expect(String(err.message)).not.toMatch(/587/);
    expect(String(err.message)).toMatch(/发送测试邮件失败|服务端日志|查看/);
  });

  test("SMTP 认证失败 → 500 + 不泄漏用户名/密码", async () => {
    mock.module("#server/utils/mail", () => ({
      sendTestEmail: async () => {
        const e = new Error("Invalid login: 535-5.7.8 Username/password rejected") as Error & { code?: string };
        e.code = "EAUTH";
        throw e;
      },
    }));
    const err = await callMail({ to: "test@example.com" }).catch((e: unknown) => e as { statusCode?: number; message?: string }) as unknown as { statusCode?: number; message?: string };
    expect(err.statusCode).toBe(500);
    expect(String(err.message)).not.toMatch(/Username|password|535/);
  });

  test("已有 400(收件人空)→ 原样抛,不被 SMTP catch 吞成 500", async () => {
    const err = await callMail({}).catch((e: unknown) => e as { statusCode?: number }) as unknown as { statusCode?: number };
    expect(err.statusCode).toBe(400);
  });
});

describe("admin/contents.get Prisma 故障隔离", () => {
  test("prisma.contents.findMany 抛错 → 500 + 不泄漏 SQL 详情", async () => {
    sharedFake.on("contents", "findMany", async () => {
      throw new Error(`relation "contents" does not exist\n  sql: SELECT * FROM contents WHERE...`);
    });
    const err = await callContents().catch((e: unknown) => e as { statusCode?: number; message?: string }) as unknown as { statusCode?: number; message?: string };
    expect(err.statusCode).toBe(500);
    expect(String(err.message)).not.toMatch(/SELECT/);
    expect(String(err.message)).not.toMatch(/sql/);
    expect(String(err.message)).not.toMatch(/relation/);
  });
});