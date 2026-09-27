/**
 * server/api/messages/config.get.ts 集成测:
 *  - 信息表 messageContentId 配 → 直接返 contentId(走快速路)
 *  - 信息表无/非法 → 回退到 contents.findFirst({slug:"messages", type:1, status:1})
 *  - 两者都没有 → 200 code:404 message:"留言板未配置"(注意:不抛 500,而是包络式 404)
 *  - 整页 type/status 限定防抓到同 slug 的文章 → 关键回归点
 *  - DB 异常 → 500
 *
 * 注:与 test/zz-late/api/mini-messages-config.test.ts 是不同端点(/api/messages/config
 * vs /api/mini/messages-config),共享底层信息表但无 miniApi 包装,独立测。
 */
import "#test/helpers/nitro-globals";

import { describe, expect, test } from "bun:test";

import { callAdmin } from "#test/helpers/admin";
import { mockSharedPrisma, sharedFake } from "#test/helpers/fake-prisma";

mockSharedPrisma();

const messagesHandler = (await import("#server/api/messages/config.get")).default;

describe("messages/config.get(留言板 contentId 探测)", () => {
  test("meta 配 messageContentId(整数)→ 直接返 contentId", async () => {
    sharedFake.on("informations", "findUnique", async () => ({ value: "42" }));
    const r = (await callAdmin(messagesHandler, { method: "GET", url: "/api/messages/config" })) as unknown as {
      code: number; message: string; data: { contentId: number } | null;
    };
    expect(r).toEqual({ code: 200, message: "获取成功", data: { contentId: 42 } });
  });

  test("meta 配了但值是 0(非正整数)→ 回退到 slug 查找", async () => {
    sharedFake.on("informations", "findUnique", async () => ({ value: "0" }));
    let findFirstWhere: Record<string, unknown> | undefined;
    sharedFake.on("contents", "findFirst", async (args: { where: Record<string, unknown> }) => {
      findFirstWhere = args.where;
      return { cid: 99 };
    });
    const r = (await callAdmin(messagesHandler, { method: "GET", url: "/api/messages/config" })) as unknown as {
      data: { contentId: number };
    };
    expect(findFirstWhere).toEqual({ slug: "messages", type: 1, status: 1 });
    expect(r.data.contentId).toBe(99);
  });

  test("meta 配了但值是负数 → 回退到 slug 查找", async () => {
    sharedFake.on("informations", "findUnique", async () => ({ value: "-5" }));
    sharedFake.on("contents", "findFirst", async () => ({ cid: 7 }));
    const r = (await callAdmin(messagesHandler, { method: "GET", url: "/api/messages/config" })) as unknown as {
      data: { contentId: number };
    };
    expect(r.data.contentId).toBe(7);
  });

  test("meta 无记录 → 直接回退到 slug 查找", async () => {
    sharedFake.on("informations", "findUnique", async () => null);
    sharedFake.on("contents", "findFirst", async () => ({ cid: 5 }));
    const r = (await callAdmin(messagesHandler, { method: "GET", url: "/api/messages/config" })) as unknown as {
      data: { contentId: number };
    };
    expect(r.data.contentId).toBe(5);
  });

  test("两者都没有 → 200 code:404 '留言板未配置'", async () => {
    sharedFake.on("informations", "findUnique", async () => null);
    sharedFake.on("contents", "findFirst", async () => null);
    const r = (await callAdmin(messagesHandler, { method: "GET", url: "/api/messages/config" })) as unknown as {
      code: number; message: string; data: null;
    };
    expect(r).toEqual({ code: 404, message: "留言板未配置", data: null });
  });

  test("DB 异常 → 500(与「未配置」区分)", async () => {
    sharedFake.on("informations", "findUnique", async () => { throw new Error("db down"); });
    await expect(callAdmin(messagesHandler, { method: "GET", url: "/api/messages/config" }))
      .rejects.toMatchObject({ statusCode: 500 });
  });
});