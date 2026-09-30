/**
 * server/api/messages/config.get.ts:
 *  - 优先读 meta.messageContentId → 正整数
 *  - 缺/非正数 → 走 slug='messages'(type:1, status:1) 查找
 *  - 都缺 → {code:404, message:'留言板未配置', data:null}
 *  - 异常 → 500 '获取留言板配置失败'
 */
import "#test/helpers/nitro-globals";

import { beforeEach, describe, expect, test } from "bun:test";

import { mockSharedPrisma, sharedFake } from "#test/helpers/fake-prisma";

mockSharedPrisma();

const { default: configHandler } = await import("#server/api/messages/config.get");

beforeEach(() => {
  sharedFake.on("informations", "findUnique", async () => null);
  sharedFake.on("contents", "findFirst", async () => null);
});

function call(): Promise<unknown> {
  return (configHandler as (e: never) => Promise<unknown>)({} as never);
}

describe("messages/config.get", () => {
  test("meta 配 messageContentId='42' → 返 {code:200, contentId:42}", async () => {
    sharedFake.on("informations", "findUnique", async () => ({ value: "42" }));
    const res = await call() as { code: number; data: { contentId: number } };
    expect(res.code).toBe(200);
    expect(res.data.contentId).toBe(42);
  });

  test("meta 配 messageContentId='0' → 0 非正数,fallback 到 slug 查找", async () => {
    sharedFake.on("informations", "findUnique", async () => ({ value: "0" }));
    sharedFake.on("contents", "findFirst", async () => ({ cid: 7 }));
    const res = await call() as { code: number; data: { contentId: number } };
    expect(res.code).toBe(200);
    expect(res.data.contentId).toBe(7);
  });

  test("meta 配 messageContentId='abc' → 非数字,fallback 到 slug 查找", async () => {
    sharedFake.on("informations", "findUnique", async () => ({ value: "abc" }));
    sharedFake.on("contents", "findFirst", async () => ({ cid: 9 }));
    const res = await call() as { code: number; data: { contentId: number } };
    expect(res.code).toBe(200);
    expect(res.data.contentId).toBe(9);
  });

  test("meta 缺 + slug 也找不到 → {code:404, data:null}", async () => {
    sharedFake.on("informations", "findUnique", async () => null);
    sharedFake.on("contents", "findFirst", async () => null);
    const res = await call() as { code: number; message: string; data: unknown };
    expect(res.code).toBe(404);
    expect(res.message).toContain("留言板未配置");
    expect(res.data).toBeNull();
  });

  test("异常 → 500 '获取留言板配置失败',message 不外泄", async () => {
    sharedFake.on("informations", "findUnique", async () => {
      throw new Error("DB internal: 0xdeadbeef");
    });
    const origErr = console.error;
    console.error = () => {};
    try {
      await expect(call()).rejects.toMatchObject({
        statusCode: 500,
        message: "获取留言板配置失败",
      });
    } finally {
      console.error = origErr;
    }
  });
});