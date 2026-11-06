// 受影响路径枚举：超过阈值要退回目录刷新（否则旧文章 URL 不刷）。
import "#test/helpers/nitro-globals";

import { beforeEach, describe, expect, mock, test } from "bun:test";

let relationCount = 0;
let laterCount = 0;
const relationRows: unknown[] = [];
/** 相关文章反查用的文章表（cid / slug / create_time / 标签 mid / 分类 slug） */
let articleRows: {
  cid: number;
  slug: string;
  type: number;
  create_time: Date;
  contentrelations: { metas: { mid: number; slug: string; type: string } }[];
}[] = [];

/** 反查用到的查询形状（只 mock 用到的三个 where 组合） */
interface MockFindManyArgs {
  where?: {
    cid?: { not?: number; in?: number[] };
    contentrelations?: { some?: { mid?: number | { in?: number[] } } };
  };
}

mock.module("#server/utils/prisma", () => ({
  prisma: {
    contentrelations: {
      count: async () => relationCount,
      findMany: async () => relationRows,
    },
    contents: {
      count: async () => laterCount,
      findUnique: async ({ where }: { where: { cid: number } }) =>
        articleRows.find(row => row.cid === where.cid) ?? null,
      findMany: async (args: MockFindManyArgs) => {
        const where = args?.where ?? {};
        const byCreateTime = (list: typeof articleRows) =>
          [...list].sort((a, b) => b.create_time.getTime() - a.create_time.getTime());
        const midFilter = where.contentrelations?.some?.mid;
        // ① 候选：共享标签（mid.in）且排除自己
        if (midFilter && typeof midFilter !== "number" && Array.isArray(midFilter.in)) {
          const mids = midFilter.in;
          return articleRows
            .filter(row => row.cid !== where.cid?.not)
            .filter(row => row.contentrelations.some(rel => rel.metas.type === "tag" && mids.includes(rel.metas.mid)));
        }
        // ② 单标签的最近 20 篇（候选池组成单元）
        if (typeof midFilter === "number") {
          const mid = midFilter;
          return byCreateTime(
            articleRows.filter(row => row.contentrelations.some(rel => rel.metas.type === "tag" && rel.metas.mid === mid)),
          ).slice(0, 20).map(row => ({ cid: row.cid }));
        }
        // ③ 候选池成员补齐字段
        if (Array.isArray(where.cid?.in)) {
          const cids = where.cid.in;
          return articleRows.filter(row => cids.includes(row.cid));
        }
        return [];
      },
    },
  },
}));

const { contentArticlePaths, contentListPagePaths, contentUrlPaths, metaContentPaths, relatedContentPagePaths } = await import("#server/utils/content-urls");

beforeEach(() => {
  relationCount = 0;
  laterCount = 0;
  relationRows.length = 0;
  articleRows = [];
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

describe("relatedContentPagePaths（谁会在「相关文章」里引用这篇文章）", () => {
  /** 造一篇：tagMid 标签 + note 分类 */
  const article = (cid: number, slug: string, day: number) => ({
    cid,
    slug,
    type: 0,
    create_time: new Date(`2026-01-${String(day).padStart(2, "0")}T00:00:00Z`),
    contentrelations: [
      { metas: { mid: 10, slug: "t", type: "tag" } },
      { metas: { mid: 1, slug: "note", type: "category" } },
    ],
  });

  test("最新的一篇会被所有同标签文章的「相关文章」引用", async () => {
    articleRows = [article(1, "x", 10), article(2, "a", 9), article(3, "b", 8)];
    const paths = await relatedContentPagePaths(1, [10]);
    expect(paths.sort()).toEqual(["/content/note/a", "/content/note/b"]);
  });

  test("最旧的一篇排不进任何人的 top3 → 没有页面需要刷新", async () => {
    articleRows = [
      article(1, "x", 1),
      article(2, "a", 10),
      article(3, "b", 9),
      article(4, "c", 8),
      article(5, "d", 7),
    ];
    expect(await relatedContentPagePaths(1, [10])).toEqual([]);
  });

  test("没有标签 → 谁都不会引用它", async () => {
    articleRows = [article(1, "x", 10), article(2, "a", 9)];
    expect(await relatedContentPagePaths(1, [])).toEqual([]);
  });
});
