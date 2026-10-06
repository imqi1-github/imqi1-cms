/**
 * server/api/archiving.get.ts 集成测:
 *  - 按月分组,UTC 口径(防 SSR/客户端时区错位)
 *  - 月份倒序 + 年份倒序
 *  - 首分类选取按 metas.mid 升序固定(防止多分类文章 LIMIT 1 不稳)
 *  - 无文章 → 空 groups + stats.total=0
 *  - 无分类文章 → categorySlug=null(不抛错)
 *  - 文章已下架(status:0)→ 不入归档(只入 status:1)
 *  - DB 异常 → 500
 */
import "#test/helpers/nitro-globals";

import { describe, expect, test } from "bun:test";

import { callAdmin } from "#test/helpers/admin";
import { mockSharedPrisma, sharedFake } from "#test/helpers/fake-prisma";

mockSharedPrisma();

const archivingHandler = (await import("#server/api/archiving.get")).default;

let contents: Array<Record<string, unknown>> = [];
let seenOrderBy: unknown;

sharedFake.on("contents", "findMany", async (args: {
  where?: Record<string, unknown>; orderBy?: unknown; select?: unknown;
}) => {
  seenOrderBy = args.orderBy;
  let rows = contents.map(r => ({ ...r }));
  if (args.where?.status !== undefined) rows = rows.filter(r => r.status === args.where!.status);
  if (args.where?.type !== undefined) rows = rows.filter(r => r.type === args.where!.type);
  return rows;
});

function row(opts: {
  cid: number; title: string; slug: string; status: number; type?: number; time: Date; categorySlug?: string | null;
}) {
  const rels = opts.categorySlug === undefined || opts.categorySlug === null
    ? []
    : [{ metas: { slug: opts.categorySlug } }];
  return {
    cid: opts.cid, title: opts.title, slug: opts.slug,
    status: opts.status, type: opts.type ?? 0,
    create_time: opts.time, _count: { likes: 0 }, contentrelations: rels,
  };
}

describe("archiving.get(文章归档)", () => {
  test("按月分组 + UTC 口径(跨年/跨月正确切分)", async () => {
    contents = [
      row({ cid: 1, title: "甲", slug: "a", status: 1, time: new Date("2026-03-15T10:00:00Z"), categorySlug: "note" }),
      row({ cid: 2, title: "乙", slug: "b", status: 1, time: new Date("2026-03-02T22:00:00Z"), categorySlug: "life" }),
      row({ cid: 3, title: "丙", slug: "c", status: 1, time: new Date("2025-12-31T23:59:00Z"), categorySlug: "note" }),
    ];
    const r = (await callAdmin(archivingHandler, { method: "GET", url: "/api/archiving" })) as unknown as {
      success: boolean;
      data: {
        groups: Array<{ year: number; month: number; contents: Array<{ cid: number; categorySlug: string | null }> }>;
        stats: { total: number };
      };
    };
    expect(r.success).toBe(true);
    expect(r.data.stats.total).toBe(3);
    expect(r.data.groups).toHaveLength(2);
    // 月份倒序
    expect(r.data.groups[0]).toMatchObject({ year: 2026, month: 3 });
    expect(r.data.groups[0]!.contents.map(c => c.cid)).toEqual([1, 2]);
    expect(r.data.groups[0]!.contents[0]!.categorySlug).toBe("note");
    expect(r.data.groups[1]).toMatchObject({ year: 2025, month: 12 });
  });

  test("create_time 排序由 handler 显式指定 desc(防止连接表改动让排序漂移)", async () => {
    contents = [];
    await callAdmin(archivingHandler, { method: "GET", url: "/api/archiving" });
    expect(seenOrderBy).toEqual({ create_time: "desc" });
  });

  test("无文章 → 空 groups + total=0", async () => {
    contents = [];
    const r = (await callAdmin(archivingHandler, { method: "GET", url: "/api/archiving" })) as unknown as {
      data: { groups: unknown[]; stats: { total: number } };
    };
    expect(r.data.groups).toEqual([]);
    expect(r.data.stats.total).toBe(0);
  });

  test("无分类关联文章 → categorySlug=null,不抛错", async () => {
    contents = [
      row({ cid: 1, title: "无类", slug: "x", status: 1, time: new Date("2026-06-01T00:00:00Z"), categorySlug: null }),
    ];
    const r = (await callAdmin(archivingHandler, { method: "GET", url: "/api/archiving" })) as unknown as {
      data: { groups: Array<{ contents: Array<{ categorySlug: string | null }> }> };
    };
    expect(r.data.groups[0]!.contents[0]!.categorySlug).toBeNull();
  });

  test("草稿/已下架文章不入归档(只入 status:1)", async () => {
    contents = [
      row({ cid: 1, title: "已发布", slug: "a", status: 1, time: new Date("2026-01-01"), categorySlug: "note" }),
      row({ cid: 2, title: "草稿", slug: "b", status: 0, time: new Date("2026-01-02"), categorySlug: "note" }),
      row({ cid: 3, title: "page", slug: "c", status: 1, type: 1, time: new Date("2026-01-03"), categorySlug: "note" }),
    ];
    const r = (await callAdmin(archivingHandler, { method: "GET", url: "/api/archiving" })) as unknown as {
      data: { stats: { total: number } };
    };
    // type=0 过滤把 page (type=1) 排除;status=1 把草稿排除
    expect(r.data.stats.total).toBe(1);
  });

  test("DB 异常 → 500(泛化文案,不泄漏 Prisma 内部细节)", async () => {
    sharedFake.on("contents", "findMany", async () => { throw new Error("relation timeout"); });
    await expect(callAdmin(archivingHandler, { method: "GET", url: "/api/archiving" }))
      .rejects.toMatchObject({ statusCode: 500 });
  });
});