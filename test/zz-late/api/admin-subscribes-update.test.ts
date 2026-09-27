import { beforeEach, describe, expect, mock, test } from "bun:test";

import { CSRF_TOKEN, callAdmin, loginSessionCookie } from "#test/helpers/admin";
import { mockSharedPrisma } from "#test/helpers/fake-prisma";

mockSharedPrisma();

// rss.updateAllSubscribes mock:可控是否抛错 + 调用计数
let updateCalled = 0;
let updateError: Error | null = null;
mock.module("#server/utils/rss", () => ({
  updateAllSubscribes: async () => {
    updateCalled++;
    if (updateError) throw updateError;
  },
}));

const handler = (await import("#server/api/admin/subscribes/update.post")).default;

beforeEach(() => {
  updateCalled = 0;
  updateError = null;
});

describe("admin/subscribes/update.post(触发全量订阅更新)", () => {
  test("未登录 → 401", async () => {
    await expect(callAdmin(handler, {
      method: "POST",
      body: { csrfToken: CSRF_TOKEN },
      cookie: "csrf_token=" + CSRF_TOKEN,
    })).rejects.toMatchObject({ statusCode: 401 });
  });

  test("CSRF 缺失 → 403", async () => {
    const cookie = await loginSessionCookie();
    await expect(callAdmin(handler, { method: "POST", cookie, body: {} })).rejects.toMatchObject({ statusCode: 403 });
  });

  test("成功 → 立即返回 success:true,后台执行 updateAllSubscribes", async () => {
    const cookie = await loginSessionCookie();
    const r = await callAdmin(handler, {
      method: "POST",
      cookie: cookie + "; csrf_token=" + CSRF_TOKEN,
      body: { csrfToken: CSRF_TOKEN },
    }) as { success: boolean; data: { started: boolean } };
    expect(r.success).toBe(true);
    expect(r.data.started).toBe(true);
    expect(updateCalled).toBe(1);
  });

  test("updateAllSubscribes 抛错 → 不影响响应(异步 fire-and-forget)", async () => {
    updateError = new Error("RSS 上游炸了");
    const cookie = await loginSessionCookie();
    const r = await callAdmin(handler, {
      method: "POST",
      cookie: cookie + "; csrf_token=" + CSRF_TOKEN,
      body: { csrfToken: CSRF_TOKEN },
    }) as { success: boolean };
    expect(r.success).toBe(true);
    expect(updateCalled).toBe(1);
  });

  test("body 缺省 → 视作空 body(读 body 失败回退 {} → 仍 403)", async () => {
    const cookie = await loginSessionCookie();
    await expect(callAdmin(handler, { method: "POST", cookie, body: undefined })).rejects.toMatchObject({ statusCode: 403 });
  });
});