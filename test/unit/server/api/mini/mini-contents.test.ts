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
}));

// 相册分类 mid(用于「最新文章排除相册分类」的判定)
let photoMid: number | undefined = undefined;
const realMini = await import("#server/utils/mini");
mock.module("#server/utils/mini", () => ({
  ...realMini,
  getPhotoCategoryMid: async () => photoMid,
}));

const contents = [
  { cid: 1, title: "文章一", covers: JSON.stringify([{ url: "/imgs/a.webp" }]), create_time: new Date("2026-03-01T00:00:00Z") },
  { cid: 2, title: "文章二", covers: "[]", create_time: new Date("2026-02-01T00:00:00Z") },
];

sharedFake.on("contents", "findMany", async () => contents.map(c => ({ ...c })));

const metas = [
  { mid: 1, name: "笔记", slug: "note", desc: "笔记分类", type: "category", latest: { title: "文章一", covers: JSON.stringify([{ url: "/imgs/a.webp" }]) } },
  { mid: 2, name: "空分类", slug: "empty", desc: null, type: "category", latest: null },
];
sharedFake.on("metas", "findMany", async ({ where }: { where: { type: string } }) =>
  metas
    .filter(m => m.type === where.type)
    .map(m => ({
      mid: m.mid, name: m.name, slug: m.slug, desc: m.desc,
      contentrelations: m.latest ? [{ content: m.latest }] : [],
    })));
sharedFake.on("contentrelations", "groupBy", async () => [{ mid: 1, _count: { _all: 3 } }]);

const latestHandler = (await import("#server/api/mini/latest-contents.get")).default;
const categoriesHandler = (await import("#server/api/mini/categories.get")).default;

function ev(peer: string) {
  return makeAuthEvent({ method: "GET", peer, headers: { host: "imqi1.com" } }).event;
}

beforeEach(() => {
  fakeDataEnabled = false;
  photoMid = undefined;
});

describe("mini/latest-contents", () => {
  test("返回最新文章:封面补绝对地址、时间为相对文案", async () => {
    const r = (await latestHandler(ev("10.9.6.1"))) as unknown as { success: boolean; data: Array<Record<string, unknown>> };
    expect(r.success).toBe(true);
    expect(r.data).toHaveLength(2);
    expect(r.data[0]!.id).toBe(1);
    expect(String(r.data[0]!.cover)).toContain("/imgs/a.webp");
    expect(typeof r.data[0]!.publishedAt).toBe("string");
    // 无封面文章 cover 空串(不炸)
    expect(r.data[1]!.cover).toBe("");
  });

  test("配置了相册分类时,查询排除该分类", async () => {
    photoMid = 9;
    let capturedWhere: Record<string, unknown> = {};
    sharedFake.on("contents", "findMany", async ({ where }: { where: Record<string, unknown> }) => {
      capturedWhere = where;
      return [];
    });
    await latestHandler(ev("10.9.6.2"));
    expect(capturedWhere.contentrelations).toEqual({ none: { mid: 9 } });
  });

  test("审核模式:不查库,只回占位文章", async () => {
    fakeDataEnabled = true;
    const r = (await latestHandler(ev("10.9.6.3"))) as { data: Array<{ id: number }> };
    expect(r.data).toHaveLength(1);
    expect(r.data[0]!.id).toBe(1);
  });
});

describe("mini/categories", () => {
  test("返回分类:contentCount 取已发布口径、最新文章标题与封面", async () => {
    const r = (await categoriesHandler(ev("10.9.6.4"))) as unknown as { data: Array<Record<string, unknown>> };
    expect(r.data).toHaveLength(2);
    const withContent = r.data[0]!;
    expect(withContent.mid).toBe(1);
    expect(withContent.contentCount).toBe(3);
    expect(withContent.latestTitle).toBe("文章一");
    expect(String(withContent.cover)).toContain("/imgs/a.webp");

    // 无文章的分类:计数 0、标题空串、封面空串
    const empty = r.data[1]!;
    expect(empty.contentCount).toBe(0);
    expect(empty.latestTitle).toBe("");
    expect(empty.cover).toBe("");
    // slug 缺失回落空串
    expect(empty.slug).toBe("empty");
  });

  test("审核模式:只回占位分类", async () => {
    fakeDataEnabled = true;
    const r = (await categoriesHandler(ev("10.9.6.5"))) as { data: Array<{ mid: number }> };
    expect(r.data).toHaveLength(1);
    expect(r.data[0]!.mid).toBe(1);
  });
});
