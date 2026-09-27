import { describe, expect, test } from "bun:test";

import { CSRF_TOKEN, callAdmin, loginSessionCookie } from "#test/helpers/admin";
import { mockSharedPrisma, sharedFake } from "#test/helpers/fake-prisma";

mockSharedPrisma();

const handler = (await import("#server/api/attachments/[id].delete")).default;

describe("attachments/[id].delete 残留补测", () => {
  test("带 cid 取消关联:content 不存在 → 404", async () => {
    sharedFake.on("attachments", "findUnique", async () => ({
      aid: 1, title: "x", url: "/u", type: "image", metadata: null, create_time: new Date(),
      contentattachments: [],
    }));
    sharedFake.on("contents", "findUnique", async () => null);
    const cookie = await loginSessionCookie();
    await expect(callAdmin(handler, {
      method: "DELETE",
      cookie: cookie + "; csrf_token=" + CSRF_TOKEN,
      params: { id: "1" },
      url: "/api/attachments/1?cid=999",
      headers: { "x-csrf-token": CSRF_TOKEN },
    })).rejects.toMatchObject({ statusCode: 404 });
  });

  test("全局删除 attachments.delete P2025 → 404", async () => {
    sharedFake.on("attachments", "findUnique", async () => ({
      aid: 5, title: "x", url: "/u", type: "image", metadata: null, create_time: new Date(),
      contentattachments: [],
    }));
    sharedFake.on("attachments", "delete", async () => {
      const e = new Error("not found") as Error & { code: string };
      e.code = "P2025";
      throw e;
    });
    const cookie = await loginSessionCookie();
    await expect(callAdmin(handler, {
      method: "DELETE",
      cookie: cookie + "; csrf_token=" + CSRF_TOKEN,
      params: { id: "5" },
      headers: { "x-csrf-token": CSRF_TOKEN },
    })).rejects.toMatchObject({ statusCode: 404 });
  });

  test("全局删除未知异常 → 500", async () => {
    sharedFake.on("attachments", "findUnique", async () => ({
      aid: 6, title: "x", url: "/u", type: "image", metadata: null, create_time: new Date(),
      contentattachments: [],
    }));
    sharedFake.on("attachments", "delete", async () => { throw new Error("db boom"); });
    const cookie = await loginSessionCookie();
    await expect(callAdmin(handler, {
      method: "DELETE",
      cookie: cookie + "; csrf_token=" + CSRF_TOKEN,
      params: { id: "6" },
      headers: { "x-csrf-token": CSRF_TOKEN },
    })).rejects.toMatchObject({ statusCode: 500 });
  });
});