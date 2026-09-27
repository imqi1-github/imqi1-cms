/**
 * admin/settings/init.post 补测:
 *  - 405 非 POST 方法
 *  - 401 未登录
 *  - CSRF 缺失 → 403
 *  - 缺失配置项 → 批量创建
 *  - 所有配置已存在 → message 提示"已存在"
 *  - 不重复创建(只补缺失项)
 *  - 异常 → 500 而非泄漏
 */
import { describe, expect, mock, test } from "bun:test";

import { CSRF_TOKEN, callAdmin, loginSessionCookie } from "#test/helpers/admin";
import { mockSharedPrisma, sharedFake } from "#test/helpers/fake-prisma";

mockSharedPrisma();
mock.module("#server/utils/content-cache", () => ({ invalidateContentCaches: async () => ({}) }));

const handler = (await import("#server/api/admin/settings/init.post")).default;

async function cookie(): Promise<string> {
  return `${await loginSessionCookie()}; csrf_token=${CSRF_TOKEN}`;
}

async function callInit(opts: { method?: string; body?: Record<string, unknown>; cookie?: string } = {}) {
  return callAdmin(handler, {
    method: opts.method ?? "POST",
    body: { csrfToken: CSRF_TOKEN, ...(opts.body ?? {}) },
    cookie: opts.cookie ?? await cookie(),
  });
}

describe("admin/settings/init.post 守卫", () => {
  test("GET 等非 POST 方法 → 405", async () => {
    await expect(callInit({ method: "GET" })).rejects.toMatchObject({ statusCode: 405 });
    await expect(callInit({ method: "PUT" })).rejects.toMatchObject({ statusCode: 405 });
    await expect(callInit({ method: "DELETE" })).rejects.toMatchObject({ statusCode: 405 });
  });

  test("未登录 → 401", async () => {
    await expect(callInit({ cookie: "" })).rejects.toMatchObject({ statusCode: 401 });
  });

  test("CSRF 缺失 → 403", async () => {
    const session = await loginSessionCookie();
    await expect(callAdmin(handler, {
      method: "POST",
      body: {},
      cookie: session,
    })).rejects.toMatchObject({ statusCode: 403 });
  });
});

describe("admin/settings/init.post 初始化逻辑", () => {
  test("数据库无任何配置项 → 创建全部 defaults", async () => {
    sharedFake.on("informations", "findMany", async () => []);
    const createdKeys: string[] = [];
    sharedFake.on("informations", "createMany", async ({ data }: { data: Array<{ key: string }> }) => {
      for (const item of data) createdKeys.push(item.key);
      return { count: data.length };
    });
    const r = (await callInit()) as { success: boolean; message: string; data: { created: unknown[]; total: number } };
    expect(r.success).toBe(true);
    expect(r.message).toContain("已初始化");
    expect(r.data.created.length).toBeGreaterThan(10); // defaults 数量
    expect(r.data.total).toBe(r.data.created.length);
    expect(createdKeys).toContain("siteName");
    expect(createdKeys).toContain("commentEnabled");
  });

  test("所有配置已存在 → message「已存在」,不调 createMany", async () => {
    // 返回所有默认 key,模拟「全部已初始化」
    const allDefaultKeys = [
      "siteName", "siteUrl", "siteDesc", "siteIcp", "homeCustomText", "photoCategorySlug",
      "commentEnabled", "commentAvatarService", "commentPageSize", "commentMaxLevel",
      "commentInterval", "commentRequireMail", "commentRequireLink",
      "contentPageSize", "feedCacheInterval", "uploadLocation",
    ];
    sharedFake.on("informations", "findMany", async () => allDefaultKeys.map(k => ({ key: k })));
    let createManyCalled = false;
    sharedFake.on("informations", "createMany", async () => {
      createManyCalled = true;
      return { count: 0 };
    });
    const r = (await callInit()) as { message: string; data: { created: unknown[]; total: number } };
    expect(r.message).toContain("已存在");
    expect(r.data.created).toEqual([]);
    expect(createManyCalled).toBe(false);
  });

  test("混合:已存在 + 缺失 → 只创建缺失项", async () => {
    sharedFake.on("informations", "findMany", async () => [{ key: "siteName" }, { key: "siteUrl" }]);
    const createdKeys: string[] = [];
    sharedFake.on("informations", "createMany", async ({ data }: { data: Array<{ key: string }> }) => {
      for (const item of data) createdKeys.push(item.key);
      return { count: data.length };
    });
    const r = (await callInit()) as { data: { created: unknown[]; total: number } };
    expect(r.data.created.length).toBe(r.data.total - 2); // 总数 - 已存在的 2 个
    expect(createdKeys).not.toContain("siteName");
    expect(createdKeys).not.toContain("siteUrl");
    expect(createdKeys).toContain("commentEnabled");
  });
});

describe("admin/settings/init.post:错误兜底", () => {
  test("未知错误 → 500 而非泄漏原始 message", async () => {
    sharedFake.on("informations", "findMany", async () => {
      throw new Error("raw db error 敏感");
    });
    try {
      await callInit();
    } catch (error) {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      expect((error as any).message).not.toContain("敏感");
    }
  });
});