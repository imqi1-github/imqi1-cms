import { describe, expect, test } from "bun:test";

import { callAdmin, loginSessionCookie } from "#test/helpers/admin";
import { sharedFake } from "#test/helpers/fake-prisma";

// 复用之前测试注册的 mock(registerAuthFakes 等);本文件只补缺漏

const adminChangelogsHandler = (await import("#server/api/admin/changelogs.get")).default;
const adminCommentsHandler = (await import("#server/api/admin/comments.get")).default;

// 仅补 changelogs.findMany(之前未注册)
const changelogRows: Array<{ id: number, content: string, create_time: Date }> = [
  { id: 1, content: JSON.stringify([{ type: "修复", value: "**bug**" }]), create_time: new Date() },
];
sharedFake.on("changelogs", "findMany", async () => changelogRows.map(r => ({ ...r })));

describe("admin/changelogs.get", () => {
  test("未登录 → 401", async () => {
    await expect(callAdmin(adminChangelogsHandler, { method: "GET" })).rejects.toMatchObject({ statusCode: 401 });
  });

  test("已登录 → 返回渲染后的 changelogs", async () => {
    const cookie = await loginSessionCookie();
    const r = await callAdmin(adminChangelogsHandler, {
      method: "GET",
      cookie,
    }) as Array<{ id: number, content: Array<{ type: string, html: string }>, createTime: string }>;
    expect(Array.isArray(r)).toBe(true);
    expect(r[0]!.content[0]!.html).toContain("<strong>bug</strong>");
  });
});

describe("admin/comments.get", () => {
  test("未登录 → 401", async () => {
    await expect(callAdmin(adminCommentsHandler, { method: "GET" })).rejects.toMatchObject({ statusCode: 401 });
  });

  test("已登录 → 返回评论列表(可能为空,依之前测试 mock)", async () => {
    const cookie = await loginSessionCookie();
    const r = await callAdmin(adminCommentsHandler, {
      method: "GET",
      cookie,
    });
    expect(r).toBeDefined();
  });
});
