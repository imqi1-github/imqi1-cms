// 受影响路径枚举：超过阈值要退回目录刷新（否则旧文章 URL 不刷）。
import "#test/helpers/nitro-globals";

import { beforeEach, describe, expect, mock, test } from "bun:test";

let relationCount = 0;
let laterCount = 0;
const relationRows: unknown[] = [];

mock.module("#server/utils/prisma", () => ({
  prisma: {
    contentrelations: {
      count: async () => relationCount,
      findMany: async () => relationRows,
    },
    contents: {
      count: async () => laterCount,
    },
  },
}));

const { contentArticlePaths, contentListPagePaths, contentUrlPaths, metaContentPaths } = await import("#server/utils/content-urls");

beforeEach(() => {
  relationCount = 0;
  laterCount = 0;
  relationRows.length = 0;
});

describe("内容 URL 枚举", () => {
  test("文章页 + 分类页 + 标签页", () => {
    const paths = contentUrlPaths({
      cid: 1024,
      slug: "hello",
      type: 0,
      contentrelations: [
        { metas: { slug: "note", type: "category" } },
        { metas: { slug: "js", type: "tag" } },
      ],
    });
    expect(paths).toEqual(["/content/note/hello", "/category/note", "/tag/js"]);
  });

  test("只取文章页（点赞只刷文章页）", () => {
    expect(contentArticlePaths({
      cid: 1024,
      slug: "hello",
      type: 0,
      contentrelations: [{ metas: { slug: "note", type: "category" } }],
    })).toEqual(["/content/note/hello"]);
  });

  test("独立页面按 slug 走根路径", () => {
    expect(contentUrlPaths({ cid: 7, slug: "agreement", type: 1, contentrelations: [] })).toEqual(["/agreement"]);
  });

  test("无分类时落到 uncategorized", () => {
    expect(contentArticlePaths({ cid: 9, slug: "x", type: 0, contentrelations: [] })).toEqual(["/content/uncategorized/x"]);
  });
});

describe("metaContentPaths", () => {
  test("关联文章在阈值内 → 返回具体路径", async () => {
    relationCount = 2;
    relationRows.push({
      content: {
        cid: 1,
        slug: "a",
        type: 0,
        contentrelations: [{ metas: { slug: "note", type: "category" } }],
      },
    });
    const paths = await metaContentPaths(3, "/category/old");
    expect(paths).toContain("/content/note/a");
    expect(paths).toContain("/category/old");
  });

  test("关联文章超阈值 → 返回 null（调用方须退回目录刷新）", async () => {
    relationCount = 500;
    expect(await metaContentPaths(3, "/category/old")).toBeNull();
  });
});

describe("contentListPagePaths（文章所在的那一页）", () => {
  const row = (cid: number) => ({
    cid,
    create_time: new Date("2026-01-01T00:00:00Z"),
    contentrelations: [
      { metas: { mid: 1, slug: "note", type: "category" } },
      { metas: { mid: 9, slug: "js", type: "tag" } },
    ],
  });

  test("位次落在第 1 页 → 裸路径（与 ?page=1 同一份缓存）", async () => {
    laterCount = 0;
    expect(await contentListPagePaths([row(1024)], 12)).toEqual(["/category/note", "/tag/js"]);
  });

  test("位次 13、每页 12 → 第 2 页", async () => {
    laterCount = 12;
    expect(await contentListPagePaths([row(1024)], 12)).toEqual([
      "/category/note?page=2",
      "/tag/js?page=2",
    ]);
  });

  test("位次 21、每页 12 → 第 2 页；位次 25 → 第 3 页", async () => {
    laterCount = 20;
    expect((await contentListPagePaths([row(1024)], 12))[0]).toBe("/category/note?page=2");
    laterCount = 24;
    expect((await contentListPagePaths([row(1024)], 12))[0]).toBe("/category/note?page=3");
  });

  test("每页条数非法 → 按 1 条算，不产生 NaN/0 页", async () => {
    laterCount = 3;
    expect(await contentListPagePaths([row(1024)], 0)).toEqual([
      "/category/note?page=4",
      "/tag/js?page=4",
    ]);
  });

  test("没有分类/标签关系 → 不产出路径", async () => {
    laterCount = 0;
    expect(await contentListPagePaths([{ cid: 1, create_time: new Date(), contentrelations: [] }], 12)).toEqual([]);
  });
});
