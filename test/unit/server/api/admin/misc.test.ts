import "#test/helpers/nitro-globals";

import { describe, expect, mock, test } from "bun:test";

import { CSRF_COOKIE, CSRF_TOKEN, callAdmin, loginSessionCookie } from "#test/helpers/admin";
import { mockSharedPrisma } from "#test/helpers/fake-prisma";

mockSharedPrisma();

// rss / mail 都是外部副作用模块,用可控替身
// 工厂必须展开真模块其余导出:mock.module 是整体替换,漏导出会打穿其它测试文件
const realRss = await import("#server/utils/rss");
let updateCalls = 0;
mock.module("#server/utils/rss", () => ({
  ...realRss,
  updateAllSubscribes: async () => {
    updateCalls++;
    return { success: 2, total: 3 };
  },
  getSubscriptionStats: () => ({ totalRuns: 5, lastRunAt: "2026-01-01T00:00:00.000Z", success: 4, failed: 1 }),
}));
const realMail = await import("#server/utils/mail").catch(() => ({} as Record<string, unknown>));
let mailResult: { success: boolean; error?: string } = { success: true };
let mailThrows = false;
mock.module("#server/utils/mail", () => ({
  ...realMail,
  sendTestEmail: async () => {
    if (mailThrows) throw new Error("smtp exploded");
    return mailResult;
  },
}));

const updateHandler = (await import("#server/api/admin/subscribes/update.post")).default;
const statsHandler = (await import("#server/api/admin/subscribes/stats.get")).default;
const mailHandler = (await import("#server/api/admin/mail/test.post")).default;

async function cookie(): Promise<string> {
  return `${await loginSessionCookie()}; ${CSRF_COOKIE}`;
}

describe("admin/subscribes/update.post", () => {
  test("未登录 → 401;CSRF 缺失 → 403", async () => {
    await expect(callAdmin(updateHandler, {})).rejects.toMatchObject({ statusCode: 401 });
    const session = await loginSessionCookie();
    await expect(callAdmin(updateHandler, { cookie: session, body: {} })).rejects.toMatchObject({ statusCode: 403 });
  });

  test("触发一次全量更新(best-effort,立即返回)", async () => {
    updateCalls = 0;
    await expect(callAdmin(updateHandler, { cookie: await cookie(), body: { csrfToken: CSRF_TOKEN } })).resolves.toBeTruthy();
    expect(updateCalls).toBe(1);
  });
});

describe("admin/subscribes/stats.get", () => {
  test("未登录 → 401;已登录返回内存统计", async () => {
    await expect(callAdmin(statsHandler, {})).rejects.toMatchObject({ statusCode: 401 });
    const r = (await callAdmin(statsHandler, { method: "GET", cookie: await loginSessionCookie() })) as { totalRuns: number };
    expect(r.totalRuns).toBe(5);
  });
});

describe("admin/mail/test.post", () => {
  test("CSRF 缺失 → 403;缺收件地址 → 400", async () => {
    const session = await loginSessionCookie();
    await expect(callAdmin(mailHandler, { cookie: session, body: { to: "a@b.c" } })).rejects.toMatchObject({ statusCode: 403 });
    await expect(callAdmin(mailHandler, { cookie: await cookie(), body: { csrfToken: CSRF_TOKEN } })).rejects.toMatchObject({ statusCode: 400 });
  });

  test("发送成功返回结果;失败时透出错误", async () => {
    mailResult = { success: true };
    await expect(callAdmin(mailHandler, { cookie: await cookie(), body: { to: "a@b.c", csrfToken: CSRF_TOKEN } })).resolves.toBeTruthy();

    mailResult = { success: false, error: "SMTP 连接失败" };
    const r = (await callAdmin(mailHandler, { cookie: await cookie(), body: { to: "a@b.c", csrfToken: CSRF_TOKEN } })) as Record<string, unknown>;
    expect(r.success).toBe(false);
  });
});

describe("admin/mail/test.post 分支补测", () => {
  test("未登录 → 401;缺收件人 → 400(adminEmail 兜底另测)", async () => {
    await expect(callAdmin(mailHandler, { body: { csrfToken: CSRF_TOKEN, to: "a@b.c" } })).rejects.toMatchObject({ statusCode: 401 });
    const c = await cookie();
    await expect(callAdmin(mailHandler, { cookie: c, body: { csrfToken: CSRF_TOKEN } })).rejects.toMatchObject({ statusCode: 400 });
  });

  test("to 缺失时回退 body.adminEmail;sendTestEmail 抛错 → 500", async () => {
    const c = await cookie();
    await expect(callAdmin(mailHandler, { cookie: c, body: { csrfToken: CSRF_TOKEN, adminEmail: "admin@x.com" } })).resolves.toBeTruthy();

    mailResult = { success: false, error: "SMTP boom" };
    const r = (await callAdmin(mailHandler, { cookie: c, body: { csrfToken: CSRF_TOKEN, to: "a@b.c" } })) as { success: boolean };
    expect(r.success).toBe(false);
    mailResult = { success: true };
  });

  test("sendTestEmail 抛异常(未处理错误)→ 500;CSRF 缺失 → 403", async () => {
    const session = await loginSessionCookie();
    await expect(callAdmin(mailHandler, { cookie: session, body: { to: "a@b.c" } })).rejects.toMatchObject({ statusCode: 403 });

    mailThrows = true;
    await expect(callAdmin(mailHandler, { cookie: `${session}; ${CSRF_COOKIE}`, body: { csrfToken: CSRF_TOKEN, to: "a@b.c" } })).rejects.toMatchObject({ statusCode: 500 });
    mailThrows = false;
  });
});

describe("admin/subscribes/stats.get 分支补测", () => {
  test("未登录 → 401", async () => {
    await expect(callAdmin(statsHandler, { method: "GET" })).rejects.toMatchObject({ statusCode: 401 });
  });
});
