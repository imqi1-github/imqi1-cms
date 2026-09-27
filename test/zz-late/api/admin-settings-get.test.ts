import { describe, expect, test } from "bun:test";

import { callAdmin, loginSessionCookie } from "#test/helpers/admin";
import { mockSharedPrisma, sharedFake } from "#test/helpers/fake-prisma";

mockSharedPrisma();

const handler = (await import("#server/api/admin/settings.get")).default;

describe("admin/settings.get(后台站点设置)", () => {
  test("未登录 → 401", async () => {
    await expect(callAdmin(handler, { method: "GET" })).rejects.toMatchObject({ statusCode: 401 });
  });

  test("无 informations → 返回默认设置(siteName/siteUrl/commentEnabled 等)", async () => {
    sharedFake.on("informations", "findMany", async () => []);
    const cookie = await loginSessionCookie();
    const r = await callAdmin(handler, { method: "GET", cookie }) as Record<string, unknown>;
    expect(r.siteName).toBeDefined();
    expect(r.commentEnabled).toBe(true);
    expect(typeof r.smtpPort).toBe("number");
  });

  test("布尔/数字 settings 类型转换", async () => {
    sharedFake.on("informations", "findMany", async () => [
      { key: "commentEnabled", value: "false" },
      { key: "smtpPort", value: "465" },
      { key: "siteName", value: "我的博客" },
    ]);
    const cookie = await loginSessionCookie();
    const r = await callAdmin(handler, { method: "GET", cookie }) as Record<string, unknown>;
    expect(r.commentEnabled).toBe(false);
    expect(r.smtpPort).toBe(465);
    expect(r.siteName).toBe("我的博客");
  });

  test("未知 key → 被忽略(白名单语义)", async () => {
    sharedFake.on("informations", "findMany", async () => [
      { key: "unknownKey", value: "x" },
    ]);
    const cookie = await loginSessionCookie();
    const r = await callAdmin(handler, { method: "GET", cookie }) as Record<string, unknown>;
    expect(r).not.toHaveProperty("unknownKey");
  });

  test("数字值 NaN → 回退默认", async () => {
    sharedFake.on("informations", "findMany", async () => [
      { key: "smtpPort", value: "not-a-number" },
    ]);
    const cookie = await loginSessionCookie();
    const r = await callAdmin(handler, { method: "GET", cookie }) as Record<string, unknown>;
    expect(typeof r.smtpPort).toBe("number");
    expect(r.smtpPort).toBeGreaterThan(0);
  });
});