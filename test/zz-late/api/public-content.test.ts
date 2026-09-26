import "#test/helpers/nitro-globals";

import { beforeEach, describe, expect, test } from "bun:test";

import { makeAuthEvent } from "#test/helpers/auth-fakes";
import { mockSharedPrisma, sharedFake } from "#test/helpers/fake-prisma";

mockSharedPrisma();

// 文章详情 findFirst 的入参/出参
let articleWhere: Record<string, unknown> | null = null;
let emptyArticle = false;
const article = {
  cid: 11,
  title: "测试文章",
  slug: "hello",
  desc: "摘要",
  content: "# 大标题\n\n正文段落。",
  create_time: new Date("2026-01-01T00:00:00Z"),
  update_time: new Date("2026-02-01T00:00:00Z"),
  many_covers: 1,
  show_toc: 1,
  covers: JSON.stringify([{ url: "/uploads/a.jpg", desc: "" }]),
  user: { uid: 1, name: "admin", nickname: "阿棋", avatar: null },
  contentrelations: [
    { cid: 11, mid: 2, metas: { mid: 2, name: "笔记", slug: "note", type: "category" } },
    { cid: 11, mid: 5, metas: { mid: 5, name: "标签甲", slug: "tag-a", type: "tag" } },
  ],
  travels: [{ travel: { id: 7, name: "西湖" } }],
  attachments: [
    { attachment: { url: "/uploads/a.jpg", metadata: { width: 800, height: 600, size: 123, format: "jpg" } } },
  ],
};

sharedFake.on("contents", "findFirst", async (args: { where: Record<string, unknown> }) => {
  articleWhere = args.where;
  if (args.where.type === 0 && args.where.status === 1) {
    return emptyArticle ? null : { ...article };
  }
  if (args.where.type === 1 && args.where.status === 1) {
    return pageRow;
  }
  return null;
});

// 页面(page/[slug])数据
let pageRow: { title: string; desc: string | null; content: string } | null = {
  title: "关于站",
  desc: "页面摘要",
  content: "页面正文",
};

// category/[slug].get 的 findUnique
let categoryBySlug: Record<string, unknown> | null = { mid: 2, name: "笔记", slug: "note", desc: "笔记分类" };

// 分类/标签 findFirst(category contents 与 tag contents 共用)
let metasFirstRows: Array<Record<string, unknown>> = [
  { mid: 2, name: "笔记", slug: "note", desc: "笔记分类", type: "category" },
  { mid: 5, name: "标签甲", slug: "tag-a", desc: null, type: "tag" },
];
const seenMetaWheres: Array<Record<string, unknown>> = [];
sharedFake.on("metas", "findFirst", async (args: { where: Record<string, unknown> }) => {
  seenMetaWheres.push(args.where);
  return metasFirstRows.find(m => m.slug === args.where.slug && m.type === args.where.type) ?? null;
});
sharedFake.on("metas", "findUnique", async () => categoryBySlug);

// 分类文章列表
let catTotal = 3;
let catRelations = [
  {
    content: {
      cid: 1,
      title: "甲文",
      slug: "a",
      desc: "甲的摘要",
      create_time: new Date("2026-03-01T00:00:00Z"),
      update_time: new Date("2026-03-02T00:00:00Z"),
      comment_num: 2,
      many_covers: 1,
      covers: JSON.stringify([{ url: "/uploads/a.jpg" }]),
      contentrelations: [
        { cid: 1, mid: 2, metas: { name: "笔记", slug: "note", type: "category" } },
        { cid: 1, mid: 5, metas: { name: "标签甲", slug: "tag-a", type: "tag" } },
      ],
      attachments: [{ attachment: { url: "/uploads/a.jpg", metadata: { width: 100, height: 50 } } }],
      travels: [{ travel_id: 1 }, { travel_id: 2 }],
    },
  },
];
const seenCatListArgs: Array<{ skip?: number; take?: number }> = [];
sharedFake.on("contentrelations", "count", async () => catTotal);
sharedFake.on("contentrelations", "findMany", async (args: { skip?: number; take?: number }) => {
  seenCatListArgs.push({ skip: args.skip, take: args.take });
  return catRelations.map(r => structuredClone(r));
});

const detailHandler = (await import("#server/api/contents/[category]/[slug].get")).default;
const categoryHandler = (await import("#server/api/category/[slug].get")).default;
const catContentsHandler = (await import("#server/api/category/[slug]/contents.get")).default;
const tagContentsHandler = (await import("#server/api/tag/[slug]/contents.get")).default;
const pageHandler = (await import("#server/api/page/[slug].get")).default;

function ev(params: Record<string, string>, url = "/api/x") {
  return makeAuthEvent({ method: "GET", peer: "10.4.0.1", params, url }).event;
}

beforeEach(() => {
  articleWhere = null;
  emptyArticle = false;
  article.attachments = [{ attachment: { url: "/uploads/a.jpg", metadata: { width: 800, height: 600, size: 123, format: "jpg" } } }];
  article.covers = JSON.stringify([{ url: "/uploads/a.jpg", desc: "" }]);
  pageRow = { title: "关于站", desc: "页面摘要", content: "页面正文" };
  categoryBySlug = { mid: 2, name: "笔记", slug: "note", desc: "笔记分类" };
  metasFirstRows = [
    { mid: 2, name: "笔记", slug: "note", desc: "笔记分类", type: "category" },
    { mid: 5, name: "标签甲", slug: "tag-a", desc: null, type: "tag" },
  ];
  catTotal = 3;
  catRelations = [
    {
      content: {
        cid: 1,
        title: "甲文",
        slug: "a",
        desc: "甲的摘要",
        create_time: new Date("2026-03-01T00:00:00Z"),
        update_time: new Date("2026-03-02T00:00:00Z"),
        comment_num: 2,
        many_covers: 1,
        covers: JSON.stringify([{ url: "/uploads/a.jpg" }]),
        contentrelations: [
          { cid: 1, mid: 2, metas: { name: "笔记", slug: "note", type: "category" } },
          { cid: 1, mid: 5, metas: { name: "标签甲", slug: "tag-a", type: "tag" } },
        ],
        attachments: [{ attachment: { url: "/uploads/a.jpg", metadata: { width: 100, height: 50 } } }],
        travels: [{ travel_id: 1 }, { travel_id: 2 }],
      },
    },
  ];
  seenCatListArgs.length = 0;
});

describe("文章详情 contents/[category]/[slug].get", () => {
  test("白名单字段 + markdown 服务端渲染 + 地点展平 + 标签/分类分离", async () => {
    const r = (await detailHandler(ev({ category: "note", slug: "hello" }))) as unknown as {
      success: boolean;
      data: Record<string, unknown> & {
        tags: Array<Record<string, unknown>>;
        travels: Array<Record<string, unknown>>;
        contentrelations: Array<{ metas: { type: string } }>;
        renderedContent: string;
        // eslint 不查类型;toEqual 深比较需要宽松标注
      };
    };
    expect(r.success).toBe(true);
    expect(r.data.cid).toBe(11);
    expect(r.data.title).toBe("测试文章");
    expect(r.data.user).toMatchObject({ name: "admin" });
    expect(r.data.tags).toEqual([{ name: "标签甲", slug: "tag-a" }]);
    expect(r.data.travels).toEqual([{ id: 7, name: "西湖" }]);
    // contentrelations 只保留分类
    expect(r.data.contentrelations).toHaveLength(1);
    expect(r.data.renderedContent).toContain("<h1");
    expect(r.data.renderedContent).toContain("正文段落");
    // 白名单：原始 markdown/status/type 不外泄
    const raw = JSON.stringify(r.data);
    expect(raw).not.toContain('"status"');
    expect(raw).not.toContain('"type":0');
    expect(raw).not.toContain('"content":"#');
  });

  test("封面宽高缺失时用附件 metadata 补齐", async () => {
    article.covers = JSON.stringify([{ url: "/uploads/a.jpg", desc: "" }]);
    const r = (await detailHandler(ev({ category: "note", slug: "hello" }))) as unknown as {
      data: { covers: Array<Record<string, unknown>>; markdownImages: Array<Record<string, unknown>> };
    };
    expect(r.data.covers[0]!.width).toBe(800);
    expect(r.data.covers[0]!.height).toBe(600);
    expect(r.data.markdownImages).toEqual([{ url: "/uploads/a.jpg", width: 800, height: 600 }]);
  });

  test("uncategorized:仅匹配无分类文章(contentrelations.none)", async () => {
    articleWhere = null;
    const r = (await detailHandler(ev({ category: "uncategorized", slug: "hello" }))) as unknown as { success: boolean };
    expect(r.success).toBe(true);
    const where = articleWhere as unknown as { contentrelations: { none?: unknown; some?: unknown } };
    expect(where.contentrelations.none).toBeTruthy();
    expect(where.contentrelations.some).toBeUndefined();
  });

  test("404 文章不存在;500 DB 异常", async () => {
    emptyArticle = true;
    await expect(detailHandler(ev({ category: "note", slug: "ghost" }))).rejects.toMatchObject({ statusCode: 404 });

    sharedFake.on("contents", "findFirst", async () => {
      throw new Error("db down");
    });
    await expect(detailHandler(ev({ category: "note", slug: "hello" }))).rejects.toMatchObject({ statusCode: 500 });
    sharedFake.on("contents", "findFirst", async (args: { where: Record<string, unknown> }) => {
      articleWhere = args.where;
      if (args.where.type === 0 && args.where.status === 1) return emptyArticle ? null : { ...article };
      if (args.where.type === 1 && args.where.status === 1) return pageRow;
      return null;
    });
  });
});

describe("category/[slug].get", () => {
  test("命中分类;uncategorized 虚拟分类不查库", async () => {
    const r = (await categoryHandler(ev({ slug: "note" }))) as unknown as { success: boolean; data: Record<string, unknown> };
    expect(r.data).toEqual({ mid: 2, name: "笔记", slug: "note", desc: "笔记分类" });

    const r2 = (await categoryHandler(ev({ slug: "uncategorized" }))) as unknown as { data: Record<string, unknown> };
    expect(r2.data).toEqual({ mid: 0, name: "未分类", slug: "uncategorized", desc: null });
  });

  test("404 不存在;400 缺 slug;500 DB 异常", async () => {
    categoryBySlug = null;
    await expect(categoryHandler(ev({ slug: "ghost" }))).rejects.toMatchObject({ statusCode: 404 });
    await expect(categoryHandler(ev({}))).rejects.toMatchObject({ statusCode: 400 });
    sharedFake.on("metas", "findUnique", async () => {
      throw new Error("db down");
    });
    await expect(categoryHandler(ev({ slug: "note" }))).rejects.toMatchObject({ statusCode: 500 });
    sharedFake.on("metas", "findUnique", async () => categoryBySlug);
  });
});

describe("category/[slug]/contents.get", () => {
  test("列表:白名单 + 标签分离 + 封面补宽高 + travelCount", async () => {
    const r = (await catContentsHandler(ev({ slug: "note" }))) as unknown as {
      success: boolean;
      data: {
        category: { slug: string };
        contents: Array<Record<string, unknown> & { covers: Array<{ width: number | null }>; tags: unknown[]; travelCount: number }>;
        pagination: { page: number; pageSize: number; total: number; totalPages: number };
      };
    };
    expect(r.success).toBe(true);
    expect(r.data.category.slug).toBe("note");
    expect(r.data.pagination).toEqual({ page: 1, pageSize: 12, total: 3, totalPages: 1 });
    const c = r.data.contents[0]!;
    expect(c.cid).toBe(1);
    expect(c.commentsNum).toBe(2);
    expect(c.travelCount).toBe(2);
    expect(c.tags).toEqual([{ name: "标签甲", slug: "tag-a" }]);
    expect(c.covers[0]!.width).toBe(100);
    const raw = JSON.stringify(r.data);
    expect(raw).not.toContain('"content":');
    expect(raw).not.toContain('"show_toc"');
  });

  test("分页钳制与 skip 计算", async () => {
    await catContentsHandler(ev({ slug: "note" }, "/api/x?page=3&pageSize=5"));
    expect(seenCatListArgs.at(-1)).toEqual({ skip: 10, take: 5 });
    await catContentsHandler(ev({ slug: "note" }, "/api/x?page=-5&pageSize=99999"));
    expect(seenCatListArgs.at(-1)).toEqual({ skip: 0, take: 50 });
  });

  test("404 分类不存在(type 过滤:标签 slug 不算分类)", async () => {
    metasFirstRows = [{ mid: 5, name: "标签甲", slug: "tag-a", desc: null, type: "tag" }];
    await expect(catContentsHandler(ev({ slug: "tag-a" }))).rejects.toMatchObject({ statusCode: 404 });
  });
});

describe("tag/[slug]/contents.get", () => {
  test("列表:标签兜底描述 + categoryName/categorySlug 提取 + hasMore", async () => {
    const r = (await tagContentsHandler(ev({ slug: "tag-a" }))) as unknown as {
      code: number;
      data: {
        tag: { name: string; desc: string };
        contents: Array<Record<string, unknown> & { categoryName: string | null; categorySlug: string | null; travelCount: number }>;
        pagination: { hasMore: boolean; total: number };
      };
    };
    expect(r.code).toBe(200);
    expect(r.data.tag.name).toBe("标签甲");
    expect(r.data.tag.desc).toBe('标签 "标签甲" 的相关文章');
    const c = r.data.contents[0]!;
    expect(c.categoryName).toBe("笔记");
    expect(c.categorySlug).toBe("note");
    expect(r.data.pagination.hasMore).toBe(false);
    // 查标签时 where.type 必须是 tag(防分类/标签 slug 互串)
    expect(seenMetaWheres.at(-1)).toMatchObject({ slug: "tag-a", type: "tag" });
  });

  test("404 标签不存在", async () => {
    metasFirstRows = [];
    await expect(tagContentsHandler(ev({ slug: "ghost" }))).rejects.toMatchObject({ statusCode: 404 });
  });
});

describe("page/[slug].get", () => {
  test("渲染正文且不回传原始 content/内部字段", async () => {
    const r = (await pageHandler(ev({ slug: "about" }))) as unknown as { success: boolean; data: Record<string, unknown> };
    expect(r.success).toBe(true);
    expect(r.data.title).toBe("关于站");
    expect(String(r.data.renderedContent)).toContain("页面正文");
    expect(JSON.stringify(r.data)).not.toContain('"content":"');
    // 走的是 type:1 页面查询
  });

  test("404 页面不存在;400 缺 slug", async () => {
    pageRow = null;
    await expect(pageHandler(ev({ slug: "ghost" }))).rejects.toMatchObject({ statusCode: 404 });
    await expect(pageHandler(ev({}))).rejects.toMatchObject({ statusCode: 400 });
  });
});
