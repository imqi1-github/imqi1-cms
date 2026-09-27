/**
 * server/api/admin/{stats,system-info,popular-contents,recent-comments,recent-contents}.get.ts:
 *  - 共用守卫:未登录 → 401 '请先登录'
 *  - 已登录 → 调 prisma 返聚合数据(由 prisma mock 接管)
 *  - 异常 → 500(由各自实现处理)
 *
 * 集中测试,避免每个 handler 一个文件重复 mock setup
 */
import "#test/helpers/nitro-globals";

import { beforeEach, describe, expect, mock, test } from "bun:test";

import { mockSharedPrisma, sharedFake } from "#test/helpers/fake-prisma";

mockSharedPrisma();

let getUserImpl: (e: unknown) => Promise<unknown>;

beforeEach(() => {
  getUserImpl = async () => ({ uid: 1 });
  mock.module("#server/lib/auth", () => ({
    getUser: async (e: unknown) => getUserImpl(e),
  }));
  // stats/system-info 内部可能调 $queryRaw / 多 model;注册默认 stub 防抛
  sharedFake.on("$queryRaw", async () => []);
  sharedFake.on("contents", "findMany", async () => []);
  sharedFake.on("contents", "count", async () => 0);
  sharedFake.on("contents", "groupBy", async () => []);
  sharedFake.on("comments", "findMany", async () => []);
  sharedFake.on("comments", "count", async () => 0);
  sharedFake.on("links", "count", async () => 0);
  sharedFake.on("subscribes", "count", async () => 0);
  sharedFake.on("users", "count", async () => 0);
  sharedFake.on("metas", "count", async () => 0);
  sharedFake.on("attachments", "count", async () => 0);
  sharedFake.on("attachments", "findMany", async () => []);
});

const { default: statsHandler } = await import("#server/api/admin/stats.get");
const { default: systemInfoHandler } = await import("#server/api/admin/system-info.get");
const { default: popularHandler } = await import("#server/api/admin/popular-contents.get");
const { default: recentCommentsHandler } = await import("#server/api/admin/recent-comments.get");
const { default: recentContentsHandler } = await import("#server/api/admin/recent-contents.get");

function call(handler: (e: never) => Promise<unknown>): Promise<unknown> {
  return handler({} as never);
}

describe("dashboard 5 件套:未登录守卫", () => {
  test("stats.get 未登录 → 401", async () => {
    getUserImpl = async () => null;
    await expect(call(statsHandler as (e: never) => Promise<unknown>)).rejects.toMatchObject({ statusCode: 401 });
  });

  test("system-info.get 未登录 → 401", async () => {
    getUserImpl = async () => null;
    await expect(call(systemInfoHandler as (e: never) => Promise<unknown>)).rejects.toMatchObject({ statusCode: 401 });
  });

  test("popular-contents.get 未登录 → 401", async () => {
    getUserImpl = async () => null;
    await expect(call(popularHandler as (e: never) => Promise<unknown>)).rejects.toMatchObject({ statusCode: 401 });
  });

  test("recent-comments.get 未登录 → 401", async () => {
    getUserImpl = async () => null;
    await expect(call(recentCommentsHandler as (e: never) => Promise<unknown>)).rejects.toMatchObject({ statusCode: 401 });
  });

  test("recent-contents.get 未登录 → 401", async () => {
    getUserImpl = async () => null;
    await expect(call(recentContentsHandler as (e: never) => Promise<unknown>)).rejects.toMatchObject({ statusCode: 401 });
  });
});

describe("dashboard 5 件套:已登录正常调用", () => {
  test("stats.get 已登录 → 调 prisma 返回对象", async () => {
    sharedFake.on("contents", "count", async () => 10);
    sharedFake.on("comments", "count", async () => 5);
    // stats 内部还可能查更多(各 handler 不一致)— 让 prisma 假件返默认空,验证 handler 不抛
    const res = await call(statsHandler as (e: never) => Promise<unknown>);
    expect(res).toBeDefined();
  });

  test("system-info.get 已登录 → 调 prisma 不抛", async () => {
    const res = await call(systemInfoHandler as (e: never) => Promise<unknown>);
    expect(res).toBeDefined();
  });

  test("popular-contents.get 已登录 → 调 prisma.findMany 不抛", async () => {
    sharedFake.on("contents", "findMany", async () => []);
    const res = await call(popularHandler as (e: never) => Promise<unknown>);
    expect(res).toBeDefined();
  });

  test("recent-comments.get 已登录 → 调 prisma.findMany 不抛", async () => {
    sharedFake.on("comments", "findMany", async () => []);
    const res = await call(recentCommentsHandler as (e: never) => Promise<unknown>);
    expect(res).toBeDefined();
  });

  test("recent-contents.get 已登录 → 调 prisma.findMany 不抛", async () => {
    sharedFake.on("contents", "findMany", async () => []);
    const res = await call(recentContentsHandler as (e: never) => Promise<unknown>);
    expect(res).toBeDefined();
  });
});