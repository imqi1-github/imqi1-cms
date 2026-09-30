import "#test/helpers/nitro-globals";

import { beforeEach, describe, expect, test } from "bun:test";

import { makeAuthEvent } from "#test/helpers/auth-fakes";
import { mockSharedPrisma, sharedFake } from "#test/helpers/fake-prisma";

mockSharedPrisma();

// 分类/标签/文章数据
let metas = [
  { mid: 1, name: "笔记", slug: "note", desc: "笔记分类", type: "category", cnt: 3 },
  { mid: 2, name: "空分类", slug: "empty", desc: null, type: "category", cnt: 0 },
  { mid: 5, name: "标签甲", slug: "tag-a", type: "tag" },
];
// take 用于断言 limit 钳制;记录每次调用收到的 take
const seenTakes: number[] = [];
sharedFake.on("metas", "findMany", async ({ where, take }: { where: { type: string }; take?: number }) => {
  if (take !== undefined) seenTakes.push(take);
  return metas
    .filter(m => m.type === where.type)
    .map(m => ({ mid: m.mid, name: m.name, slug: m.slug, desc: m.desc ?? null, _count: { contentrelations: m.cnt ?? 0 } }));
});
sharedFake.on("contentrelations", "groupBy", async () => [{ mid: 5, _count: { _all: 2 } }]);

const contents = [
  {
    cid: 1, title: "三月文", slug: "mar", create_time: new Date(Date.UTC(2026, 2, 15)),
    contentrelations: [{ metas: { slug: "note" } }],
  },
  {
    cid: 2, title: "无分类文", slug: "noclass", create_time: new Date(Date.UTC(2026, 2, 2)),
    contentrelations: [],
  },
  {
    cid: 3, title: "一月文", slug: "jan", create_time: new Date(Date.UTC(2026, 0, 9)),
    contentrelations: [{ metas: { slug: "note" } }],
  },
];
sharedFake.on("contents", "findMany", async () => contents.map(c => ({ ...c })));

const categoriesHandler = (await import("#server/api/categories.get")).default;
const tagsHandler = (await import("#server/api/tags.get")).default;
const archivingHandler = (await import("#server/api/archiving.get")).default;

function ev(peer: string, url = "/api/x") {
  const { event, headers } = makeAuthEvent({ method: "GET", peer, url, headers: { host: "imqi1.com" } });
  return { event, headers };
}

beforeEach(() => {
  metas = [
    { mid: 1, name: "笔记", slug: "note", desc: "笔记分类", type: "category", cnt: 3 },
    { mid: 2, name: "空分类", slug: "empty", desc: null, type: "category", cnt: 0 },
    { mid: 5, name: "标签甲", slug: "tag-a", type: "tag" },
  ];
});

describe("公开 categories.get", () => {
  test("白名单字段 + 关联数;缓存头存在", async () => {
    const { event, headers } = ev("10.10.2.1");
    const r = (await categoriesHandler(event)) as unknown as { success: boolean; data: Array<Record<string, unknown>> };
    expect(r.success).toBe(true);
    expect(r.data[0]).toEqual({ mid: 1, name: "笔记", slug: "note", desc: "笔记分类", contentCount: 3 });
    expect(headers["cache-control"]).toBeTruthy();
  });

  test("limit 钳制到 [1,100];非法值回落默认 4", async () => {
    seenTakes.length = 0;
    await categoriesHandler(ev("10.10.2.2", "/api/categories?limit=99999").event);
    await categoriesHandler(ev("10.10.2.3", "/api/categories?limit=abc").event);
    expect(seenTakes).toEqual([100, 4]);
  });
});

describe("公开 tags.get", () => {
  test("返回 name/slug/count(mid 不外泄)", async () => {
    const r = (await tagsHandler(ev("10.10.2.4").event)) as unknown as { success: boolean; data: Array<Record<string, unknown>> };
    expect(r.data).toEqual([{ name: "标签甲", slug: "tag-a", count: 2 }]);
    expect(JSON.stringify(r)).not.toContain('"mid"');
  });
});

describe("公开 archiving.get", () => {
  test("按 UTC 年月分组、组内倒序、无分类文章 categorySlug 为 null", async () => {
    const r = (await archivingHandler(makeAuthEvent({ method: "GET", peer: "10.10.9.7" }).event)) as unknown as {
      data: {
        groups: Array<{ year: number; month: number; contents: Array<{ cid: number; categorySlug: string | null }> }>;
        stats: { total: number };
      };
    };
    expect(r.data.groups).toHaveLength(2);
    expect(r.data.groups[0]!.year).toBe(2026);
    expect(r.data.groups[0]!.month).toBe(3);
    expect(r.data.groups[0]!.contents.map(c => c.cid)).toEqual([1, 2]);
    expect(r.data.groups[0]!.contents[1]!.categorySlug).toBeNull();
    expect(r.data.groups[1]!.month).toBe(1);
    expect(r.data.stats.total).toBe(3);
  });
});
