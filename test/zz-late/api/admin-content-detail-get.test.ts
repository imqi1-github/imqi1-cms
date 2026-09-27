import { describe, expect, test } from "bun:test";

import { callAdmin, loginSessionCookie } from "#test/helpers/admin";
import { mockSharedPrisma, sharedFake } from "#test/helpers/fake-prisma";

mockSharedPrisma();

const handler = (await import("#server/api/admin/contents/[cid].get")).default;

describe("admin/contents/[cid].get(后台单篇文章)", () => {
  test("未登录 → 401", async () => {
    await expect(callAdmin(handler, { method: "GET", params: { cid: "1" } })).rejects.toMatchObject({ statusCode: 401 });
  });

  test("cid 非正整数 → 400", async () => {
    const cookie = await loginSessionCookie();
    await expect(callAdmin(handler, { method: "GET", cookie, params: { cid: "abc" } })).rejects.toMatchObject({ statusCode: 400 });
    await expect(callAdmin(handler, { method: "GET", cookie, params: { cid: "0" } })).rejects.toMatchObject({ statusCode: 400 });
  });

  test("文章不存在 → 404", async () => {
    sharedFake.on("contents", "findUnique", async () => null);
    const cookie = await loginSessionCookie();
    await expect(callAdmin(handler, { method: "GET", cookie, params: { cid: "999" } })).rejects.toMatchObject({ statusCode: 404 });
  });

  test("成功 → 返回 content + user 白名单", async () => {
    sharedFake.on("contents", "findUnique", async () => ({
      cid: 1,
      title: "test",
      slug: "test",
      desc: null,
      content: "正文",
      status: 1,
      type: 0,
      cover: null,
      covers: null,
      many_covers: null,
      user: { uid: 1, name: "admin", avatar: null },
    }));
    const cookie = await loginSessionCookie();
    const r = await callAdmin(handler, { method: "GET", cookie, params: { cid: "1" } }) as { success: boolean; data: { cid: number; user: { name: string } } };
    expect(r.success).toBe(true);
    expect(r.data.cid).toBe(1);
    expect(r.data.user.name).toBe("admin");
  });
});