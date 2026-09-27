/**
 * server/api/mini/messages-config.get.ts:
 *  - miniFakeData 审核模式 → 不查库,返 contentId=null
 *  - 否则查库:meta → slug 回退
 *  - 异常 → 500 '获取小程序留言板配置失败'
 *
 * 放 zz-late/:mock #server/utils/mini-fake-data(进程级污染)
 */
import "#test/helpers/nitro-globals";

import { beforeEach, describe, expect, mock, test } from "bun:test";

import { mockSharedPrisma, sharedFake } from "#test/helpers/fake-prisma";

mockSharedPrisma();

let isMiniFakeDataImpl: () => boolean;
let miniCommentsEnabledImpl: () => boolean;

beforeEach(() => {
  isMiniFakeDataImpl = () => false;
  miniCommentsEnabledImpl = () => true;
  mock.module("#server/utils/mini-fake-data", () => ({
    isMiniFakeDataEnabled: () => isMiniFakeDataImpl(),
    miniCommentsEnabled: () => miniCommentsEnabledImpl(),
  }));
  sharedFake.on("informations", "findUnique", async () => null);
  sharedFake.on("contents", "findFirst", async () => null);
});

const { default: configHandler } = await import("~/../server/api/mini/messages-config.get");

function call(): Promise<unknown> {
  return (configHandler as (e: never) => Promise<unknown>)({} as never);
}

describe("mini/messages-config.get", () => {
  test("审核模式 → 不查库,返 contentId=null + commentEnabled", async () => {
    isMiniFakeDataImpl = () => true;
    miniCommentsEnabledImpl = () => false;
    let findUniqueCalls = 0;
    sharedFake.on("informations", "findUnique", async () => { findUniqueCalls++; return null; });
    const res = await call() as { success: boolean; data: { contentId: number | null; commentEnabled: boolean } };
    expect(res.success).toBe(true);
    expect(res.data.contentId).toBeNull();
    expect(res.data.commentEnabled).toBe(false);
    expect(findUniqueCalls).toBe(0); // 关键:审核模式不查库
  });

  test("非审核 + meta 配 messageContentId → 返 contentId + commentEnabled", async () => {
    isMiniFakeDataImpl = () => false;
    miniCommentsEnabledImpl = () => true;
    sharedFake.on("informations", "findUnique", async () => ({ value: "123" }));
    const res = await call() as { data: { contentId: number; commentEnabled: boolean } };
    expect(res.data.contentId).toBe(123);
    expect(res.data.commentEnabled).toBe(true);
  });

  test("非审核 + meta 缺 → 走 slug 查找", async () => {
    isMiniFakeDataImpl = () => false;
    miniCommentsEnabledImpl = () => true;
    sharedFake.on("informations", "findUnique", async () => null);
    sharedFake.on("contents", "findFirst", async () => ({ cid: 8 }));
    const res = await call() as { data: { contentId: number } };
    expect(res.data.contentId).toBe(8);
  });

  test("非审核 + 都缺 → contentId=null", async () => {
    isMiniFakeDataImpl = () => false;
    miniCommentsEnabledImpl = () => true;
    sharedFake.on("informations", "findUnique", async () => null);
    sharedFake.on("contents", "findFirst", async () => null);
    const res = await call() as { data: { contentId: number | null; commentEnabled: boolean } };
    expect(res.data.contentId).toBeNull();
    expect(res.data.commentEnabled).toBe(true);
  });

  test("异常 → 500 '获取小程序留言板配置失败'", async () => {
    isMiniFakeDataImpl = () => false;
    sharedFake.on("informations", "findUnique", async () => {
      throw new Error("DB 0xdeadbeef");
    });
    const origErr = console.error;
    console.error = () => {};
    try {
      await expect(call()).rejects.toMatchObject({
        statusCode: 500,
        message: "获取小程序留言板配置失败",
      });
    } finally {
      console.error = origErr;
    }
  });
});