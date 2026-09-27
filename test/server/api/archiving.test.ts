/**
 * server/api/archiving.get.ts:
 *  - 只取 type=0 文章(status=1),select 白名单(无 content 正文)
 *  - 按 create_time UTC 年月分组
 *  - 按 year/month 倒序
 *  - stats: {total}
 *  - 异常 → 500 '获取归档失败'
 */
import "#test/helpers/nitro-globals";

import { beforeEach, describe, expect, test } from "bun:test";

import { mockSharedPrisma, sharedFake } from "#test/helpers/fake-prisma";

mockSharedPrisma();

const { default: archiveHandler } = await import("~/../server/api/archiving.get");

beforeEach(() => {
  sharedFake.on("contents", "findMany", async () => []);
});

function callArchive(): Promise<unknown> {
  return (archiveHandler as (e: never) => Promise<unknown>)({} as never);
}

describe("archiving.get", () => {
  test("空数据 → {groups: [], stats: {total: 0}}", async () => {
    const res = await callArchive() as { success: boolean; data: { groups: unknown[]; stats: { total: number } } };
    expect(res.success).toBe(true);
    expect(res.data.groups).toEqual([]);
    expect(res.data.stats.total).toBe(0);
  });

  test("按 UTC 年月分组 + 倒序", async () => {
    sharedFake.on("contents", "findMany", async () => [
      { cid: 1, title: "A", slug: "a", create_time: new Date("2026-03-15T08:00:00Z"), contentrelations: [] },
      { cid: 2, title: "B", slug: "b", create_time: new Date("2026-03-20T10:00:00Z"), contentrelations: [] },
      { cid: 3, title: "C", slug: "c", create_time: new Date("2025-12-01T00:00:00Z"), contentrelations: [] },
    ]);
    const res = await callArchive() as { data: { groups: Array<{ year: number; month: number; contents: Array<{ cid: number }> }> } };
    // 先 2026-03,再 2025-12(倒序)
    expect(res.data.groups).toHaveLength(2);
    expect(res.data.groups[0]!.year).toBe(2026);
    expect(res.data.groups[0]!.month).toBe(3);
    expect(res.data.groups[0]!.contents).toHaveLength(2);
    expect(res.data.groups[1]!.year).toBe(2025);
    expect(res.data.groups[1]!.month).toBe(12);
  });

  test("同月内按 create_time desc 排序保留(原始 findMany orderBy 已 desc)", async () => {
    sharedFake.on("contents", "findMany", async () => [
      { cid: 5, title: "newer", slug: "n", create_time: new Date("2026-03-20T10:00:00Z"), contentrelations: [] },
      { cid: 1, title: "older", slug: "o", create_time: new Date("2026-03-15T08:00:00Z"), contentrelations: [] },
    ]);
    const res = await callArchive() as { data: { groups: Array<{ contents: Array<{ cid: number }> }> } };
    expect(res.data.groups[0]!.contents[0]!.cid).toBe(5);
    expect(res.data.groups[0]!.contents[1]!.cid).toBe(1);
  });

  test("响应字段白名单:无 content 正文/covers/desc/内部字段", async () => {
    sharedFake.on("contents", "findMany", async () => [
      { cid: 1, title: "T", slug: "s", create_time: new Date("2026-01-01T00:00:00Z"), contentrelations: [] },
    ]);
    const res = await callArchive() as { data: { groups: Array<{ contents: Array<Record<string, unknown>> }> } };
    const item = res.data.groups[0]!.contents[0]!;
    const keys = Object.keys(item).sort();
    expect(keys).toEqual(["categorySlug", "cid", "createTime", "slug", "title"]);
    expect("content" in item).toBe(false);
    expect("covers" in item).toBe(false);
  });

  test("categorySlug 取 contentrelations[0].metas.slug;无 relations → null", async () => {
    sharedFake.on("contents", "findMany", async () => [
      { cid: 1, title: "A", slug: "a", create_time: new Date("2026-01-01T00:00:00Z"), contentrelations: [{ metas: { slug: "tech" } }] },
      { cid: 2, title: "B", slug: "b", create_time: new Date("2026-01-02T00:00:00Z"), contentrelations: [] },
    ]);
    const res = await callArchive() as { data: { groups: Array<{ contents: Array<{ cid: number; categorySlug: string | null }> }> } };
    const a = res.data.groups[0]!.contents.find(c => c.cid === 1);
    const b = res.data.groups[0]!.contents.find(c => c.cid === 2);
    expect(a?.categorySlug).toBe("tech");
    expect(b?.categorySlug).toBeNull();
  });

  test("createTime 是 ISO 字符串", async () => {
    sharedFake.on("contents", "findMany", async () => [
      { cid: 1, title: "T", slug: "s", create_time: new Date("2026-03-15T08:30:00Z"), contentrelations: [] },
    ]);
    const res = await callArchive() as { data: { groups: Array<{ contents: Array<{ createTime: string }> }> } };
    expect(res.data.groups[0]!.contents[0]!.createTime).toBe("2026-03-15T08:30:00.000Z");
  });

  test("stats.total = 文章总数", async () => {
    sharedFake.on("contents", "findMany", async () => [
      { cid: 1, title: "A", slug: "a", create_time: new Date("2026-03-15T08:00:00Z"), contentrelations: [] },
      { cid: 2, title: "B", slug: "b", create_time: new Date("2026-04-15T08:00:00Z"), contentrelations: [] },
      { cid: 3, title: "C", slug: "c", create_time: new Date("2025-12-15T08:00:00Z"), contentrelations: [] },
    ]);
    const res = await callArchive() as { data: { stats: { total: number } } };
    expect(res.data.stats.total).toBe(3);
  });

  test("异常 → 500 '获取归档失败',message 不外泄原始 error", async () => {
    sharedFake.on("contents", "findMany", async () => {
      throw new Error("DB internal stack 0xabcd");
    });
    const origErr = console.error;
    console.error = () => {};
    try {
      await expect(callArchive()).rejects.toMatchObject({
        statusCode: 500,
        message: "获取归档失败",
      });
    } finally {
      console.error = origErr;
    }
  });
});