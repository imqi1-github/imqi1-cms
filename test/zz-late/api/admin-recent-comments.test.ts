/**
 * server/api/admin/recent-comments.get.ts 集成测:
 *  - 唯一零集成测的后台接口,填补 100% 覆盖率的最后 1 个缺口
 *  - 鉴权 401 + 成功 + 白名单字段(mail/ip/agent 不外泄) + 内容块字段重命名
 */
import { describe, expect, test } from "bun:test";

import { callAdmin, loginSessionCookie } from "#test/helpers/admin";
import { mockSharedPrisma, sharedFake } from "#test/helpers/fake-prisma";

mockSharedPrisma();

const handler = (await import("#server/api/admin/recent-comments.get")).default;

describe("admin/recent-comments.get(仪表盘最近评论)", () => {
  test("未登录 → 401", async () => {
    await expect(callAdmin(handler, { method: "GET" })).rejects.toMatchObject({ statusCode: 401 });
  });

  test("成功 → 字段白名单(mail/ip/agent 不外泄),content_ref 重命名为 contents", async () => {
    sharedFake.on("comments", "findMany", async () => [{
      coid: 1,
      cid: 10,
      name: "访客",
      content: "评论正文",
      create_time: new Date("2026-03-01T00:00:00Z"),
      status: 1,
      parent_id: 0,
      content_ref: { cid: 10, title: "文A" },
    }]);
    const cookie = await loginSessionCookie();
    const r = await callAdmin(handler, { method: "GET", cookie }) as Array<Record<string, unknown>>;
    expect(r).toHaveLength(1);
    const row = r[0]!;
    // 字段存在
    expect(row.coid).toBe(1);
    expect(row.cid).toBe(10);
    expect(row.name).toBe("访客");
    expect(row.content).toBe("评论正文");
    expect(row.status).toBe(1);
    // content_ref 重命名为 contents
    expect(row.contents).toEqual({ cid: 10, title: "文A" });
    expect(row.content_ref).toBeUndefined();
    // 白名单:敏感字段不外泄
    const json = JSON.stringify(r);
    expect(json).not.toContain('"mail"');
    expect(json).not.toContain('"ip"');
    expect(json).not.toContain('"agent"');
  });

  test("空表 → 返回空数组(不抛 500)", async () => {
    sharedFake.on("comments", "findMany", async () => []);
    const cookie = await loginSessionCookie();
    const r = await callAdmin(handler, { method: "GET", cookie }) as unknown[];
    expect(r).toEqual([]);
  });

  test("DB 异常 → 500(泛化文案)", async () => {
    sharedFake.on("comments", "findMany", async () => { throw new Error("db down"); });
    const cookie = await loginSessionCookie();
    await expect(callAdmin(handler, { method: "GET", cookie })).rejects.toMatchObject({ statusCode: 500 });
  });
});