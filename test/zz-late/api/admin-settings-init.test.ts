import { describe, expect, test } from "bun:test";

import { CSRF_TOKEN, callAdmin, loginSessionCookie } from "#test/helpers/admin";
import { mockSharedPrisma, sharedFake } from "#test/helpers/fake-prisma";

mockSharedPrisma();

const handler = (await import("#server/api/admin/settings/init.post")).default;

// 默认:findMany 返回空(无现有配置项,全部需要初始化);createMany 记录调用
let createManyCount = 0;
sharedFake.on("informations", "findMany", async () => []);
sharedFake.on("informations", "createMany", async () => {
  createManyCount++;
  return { count: 5 };
});

describe("admin/settings/init.post(初始化设置)", () => {
  test("GET → 405", async () => {
    const cookie = await loginSessionCookie();
    await expect(callAdmin(handler, {
      method: "GET",
      cookie: cookie + "; csrf_token=" + CSRF_TOKEN,
      url: "/api/admin/settings/init",
    })).rejects.toMatchObject({ statusCode: 405 });
  });

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

  test("成功 → 返回 success + 初始化数", async () => {
    createManyCount = 0;
    const cookie = await loginSessionCookie();
    const r = await callAdmin(handler, {
      method: "POST",
      cookie: cookie + "; csrf_token=" + CSRF_TOKEN,
      body: { csrfToken: CSRF_TOKEN },
    }) as { success: boolean; message: string; data: { total: number } };
    expect(r.success).toBe(true);
    expect(createManyCount).toBe(1);
    expect(r.data.total).toBeGreaterThan(0);
  });

  test("全部已存在 → 不调 createMany", async () => {
    createManyCount = 0;
    sharedFake.on("informations", "findMany", async () => [
      { key: "siteName" }, { key: "siteUrl" }, { key: "commentEnabled" }, { key: "commentPageSize" },
      { key: "commentMaxLevel" }, { key: "commentInterval" }, { key: "contentPageSize" },
      { key: "feedCacheInterval" }, { key: "homeCustomText" }, { key: "photoCategorySlug" },
      { key: "siteDesc" }, { key: "siteIcp" }, { key: "commentAvatarService" },
      { key: "commentRequireMail" }, { key: "commentRequireLink" }, { key: "uploadLocation" },
    ]);
    const cookie = await loginSessionCookie();
    const r = await callAdmin(handler, {
      method: "POST",
      cookie: cookie + "; csrf_token=" + CSRF_TOKEN,
      body: { csrfToken: CSRF_TOKEN },
    }) as { success: boolean; message: string };
    expect(r.success).toBe(true);
    expect(String(r.message)).toContain("已存在");
    expect(createManyCount).toBe(0);
    // 复位
    sharedFake.on("informations", "findMany", async () => []);
  });
});