import "#test/helpers/nitro-globals";

import { beforeEach, describe, expect, mock, test } from "bun:test";

import { makeAuthEvent } from "#test/helpers/auth-fakes";
import { mockSharedPrisma, sharedFake } from "#test/helpers/fake-prisma";

mockSharedPrisma();

let fakeDataEnabled = false;
const realMiniFake = await import("#server/utils/mini-fake-data");
mock.module("#server/utils/mini-fake-data", () => ({
  ...realMiniFake,
  isMiniFakeDataEnabled: () => fakeDataEnabled,
  miniCommentsEnabled: () => true,
}));

const photoMid: number | undefined = undefined;
const realMini = await import("#server/utils/mini");
mock.module("#server/utils/mini", () => ({ ...realMini, getPhotoCategoryMid: async () => photoMid }));

// 分类文章列表的数据源
let category: { mid: number; name: string; slug: string; desc: string | null } | null = {
  mid: 5, name: "笔记", slug: "note", desc: "笔记分类",
};
let relations: Array<{ content: Record<string, unknown> }> = [];
sharedFake.on("metas", "findUnique", async () => category);
sharedFake.on("contentrelations", "count", async () => relations.length);
sharedFake.on("contentrelations", "findMany", async () => relations.map(r => ({ ...r })));

const handler = (await import("#server/api/mini/category/[slug]/contents.get")).default;

function ev(peer: string, slug = "note", query = "") {
  return makeAuthEvent({ method: "GET", peer, params: { slug }, url: `/api/mini/category/${slug}/contents${query}`, headers: { host: "imqi1.com" } }).event;
}

beforeEach(() => {
  fakeDataEnabled = false;
  relations = [
    {
      content: {
        cid: 1, title: "文章一",
        covers: JSON.stringify([{ url: "/imgs/a.webp" }]),
        create_time: new Date("2026-03-01T00:00:00Z"),
        attachments: [],
      },
    },
    {
      content: {
        cid: 2, title: "无封面",
        covers: "[]",
        create_time: new Date("2026-02-01T00:00:00Z"),
        attachments: [],
      },
    },
  ];
});

describe("mini/category/[slug]/contents", () => {
  test("缺 slug 的同源路径不适用;分类不存在 → 404", async () => {
    category = null;
    await expect(handler(ev("10.9.8.1", "nope"))).rejects.toMatchObject({ statusCode: 404 });
    category = { mid: 5, name: "笔记", slug: "note", desc: null };
  });

  test("返回分类信息、文章列表与分页", async () => {
    const r = (await handler(ev("10.9.8.2"))) as unknown as {
      success: boolean;
      data: { category: { mid: number }; contents: Array<Record<string, unknown>>; pagination: Record<string, number> };
    };
    expect(r.success).toBe(true);
    expect(r.data.category.mid).toBe(5);
    expect(r.data.contents).toHaveLength(2);
    expect(r.data.pagination.total).toBe(2);
    expect(r.data.contents[0]!.coverCount).toBe(1);
    expect(String(r.data.contents[0]!.cover)).toContain("/imgs/a.webp");
    // 无封面:cover 空串、coverCount 0
    expect(r.data.contents[1]!.coverCount).toBe(0);
    expect(r.data.contents[1]!.cover).toBe("");
  });

  test("封面缺宽高时从附件 metadata 按 URL 匹配补齐", async () => {
    relations = [
      {
        content: {
          cid: 3, title: "带附件", covers: JSON.stringify([{ url: "/uploads/x.jpg" }]),
          create_time: new Date("2026-03-01T00:00:00Z"),
          attachments: [{ attachment: { url: "/uploads/x.jpg", metadata: { width: 800, height: 600, size: 1, format: "jpg" } } }],
        },
      },
    ];
    const r = (await handler(ev("10.9.8.3"))) as unknown as { data: { contents: Array<{ coverWidth: number; coverHeight: number }> } };
    expect(r.data.contents[0]!.coverWidth).toBe(800);
    expect(r.data.contents[0]!.coverHeight).toBe(600);
  });

  test("分页参数钳制(page 负数回 1,pageSize 越界回落)", async () => {
    const r = (await handler(ev("10.9.8.4", "note", "?page=-5&pageSize=99999"))) as unknown as { data: { pagination: Record<string, number> } };
    expect(r.data.pagination.page).toBe(1);
    expect(r.data.pagination.pageSize).toBeLessThanOrEqual(50);
  });

  test("审核模式:只认占位分类 slug,其余 404", async () => {
    fakeDataEnabled = true;
    const ok = (await handler(ev("10.9.8.5", "demo"))) as unknown as { data: { category: { slug: string } } };
    expect(ok.data.category.slug).toBe("demo");
    await expect(handler(ev("10.9.8.6", "note"))).rejects.toMatchObject({ statusCode: 404 });
  });
});
