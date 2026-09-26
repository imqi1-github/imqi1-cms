import { describe, expect, test } from "bun:test";

import { callAdmin, loginSessionCookie } from "#test/helpers/admin";
import { sharedFake } from "#test/helpers/fake-prisma";

// 复用之前测试注册的 mock(registerAuthFakes 等);本文件只补缺漏
// 注意:admin/comments.get 由 test/server/api/admin/comments.test.ts 覆盖(更细),
// 跨文件 contents/count mock 冲突,本文件不重复
// admin/system-info + admin/detailed-stats 已在 admin-system-get.test.ts 覆盖

const adminChangelogsHandler = (await import("#server/api/admin/changelogs.get")).default;

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