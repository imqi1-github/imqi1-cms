import "#test/helpers/nitro-globals";

import { beforeEach, describe, expect, mock, test } from "bun:test";

import { makeAuthEvent } from "#test/helpers/auth-fakes";
import { mockSharedPrisma, sharedFake } from "#test/helpers/fake-prisma";

mockSharedPrisma();

// ===== rss 订阅源:不打外网,mock 成固定 3 条 =====
const subscribePosts = [
  { title: "订阅甲", url: "https://a.com/1", pubDate: "2026-01-01" },
  { title: "订阅乙", url: "https://b.com/2", pubDate: "2026-01-02" },
  { title: "订阅丙", url: "https://c.com/3", pubDate: "2026-01-03" },
];
mock.module("#server/utils/rss", () => ({ getSubscribePosts: async () => subscribePosts.map(p => ({ ...p })) }));

// ===== informations:photoCategorySlug / messageContentId / 头像源可控 =====
let photoCategorySlug: string | null = "photos";
let messageContentIdMeta: string | null = null;
sharedFake.on("informations", "findUnique", (args: { where: { key: string } }) => {
  if (args.where.key === "photoCategorySlug") return photoCategorySlug ? { value: photoCategorySlug } : null;
  if (args.where.key === "messageContentId") return messageContentIdMeta ? { value: messageContentIdMeta } : null;
  if (args.where.key === "commentAvatarService") return { value: "gravatar" };
  if (args.where.key === "sessionStoreType") return { value: "memory" };
  return null;
});

// ===== metas:图片分类 + 前四分类 + 分区分类 =====
let photoCategory: { mid: number } | null = { mid: 9 };
const homeCategories: Array<Record<string, unknown>> = [
  { mid: 2, name: "笔记", slug: "note", desc: "d", _count: { contentrelations: 5 } },
  { mid: 9, name: "图片", slug: "photos", desc: null, _count: { contentrelations: 2 } },
];
const seenMetasFindMany: Array<Record<string, unknown>> = [];
sharedFake.on("metas", "findFirst", async () => photoCategory);
// home-data 两次查询(take 4 带 _count / take 3 不带)与 sitemap(无 take)共用,按形态分流
sharedFake.on("metas", "findMany", async (args: { take?: number; select?: Record<string, unknown> }) => {
  seenMetasFindMany.push(args);
  if (args.take === undefined) return sitemapCategories.map(c => ({ ...c }));
  if (args.select?._count) return homeCategories.map(c => ({ ...c }));
  return homeCategories.map(({ _count, ...rest }) => ({ ...rest }));
});

// ===== contents.findMany:按 where 形态分流(最新6/分区4/图片4/随机) =====
const recentRows = Array.from({ length: 6 }, (_, i) => ({
  cid: 100 + i,
  title: `最新${i}`,
  slug: `recent-${i}`,
  desc: null,
  covers: JSON.stringify([{ url: `/uploads/r${i}.jpg` }]),
  many_covers: 0,
  create_time: new Date(Date.UTC(2026, 2, 10 - i)),
  comment_num: 0,
  contentrelations: [{ metas: { mid: 2, name: "笔记", slug: "note", type: "category" } }],
  travels: [],
}));
const sectionRows = [
  {
    cid: 200, title: "分区文", slug: "sec-1", desc: null,
    covers: JSON.stringify([]), many_covers: 0,
    create_time: new Date(Date.UTC(2026, 1, 1)), comment_num: 1,
    contentrelations: [{ metas: { mid: 5, name: "标签甲", slug: "tag-a", type: "tag" } }],
    travels: [{ travel_id: 1 }],
  },
];
const photoRows = [
  {
    cid: 300, title: "图片文", slug: "photo-1",
    covers: JSON.stringify([{ url: "/uploads/p.jpg" }]),
    contentrelations: [{ metas: { name: "图片", slug: "photos" } }],
    attachments: [{ attachment: { url: "/uploads/p.jpg", metadata: { width: 640, height: 480 } } }],
  },
];
const seenContentFindMany: Array<Record<string, unknown>> = [];
const relatedCandidates: Array<Record<string, unknown>> = [
  { cid: 2, title: "双标签重合", slug: "rel-2", desc: null, covers: JSON.stringify([]), create_time: new Date("2026-01-01T00:00:00Z"), comment_num: 0, contentrelations: [{ mid: 1, metas: { mid: 1, name: "T1", slug: "t1", type: "tag" } }, { mid: 2, metas: { mid: 2, name: "T2", slug: "t2", type: "tag" } }] },
  { cid: 3, title: "单标签重合较新", slug: "rel-3", desc: null, covers: JSON.stringify([]), create_time: new Date("2026-03-01T00:00:00Z"), comment_num: 0, contentrelations: [{ mid: 1, metas: { mid: 1, name: "T1", slug: "t1", type: "tag" } }] },
  { cid: 4, title: "无重合", slug: "rel-4", desc: null, covers: JSON.stringify([]), create_time: new Date("2026-03-02T00:00:00Z"), comment_num: 0, contentrelations: [] },
];
function registerContentFindMany(): void {
  sharedFake.on("contents", "findMany", async (args: { where: Record<string, unknown>; take?: number }) => {
    seenContentFindMany.push(args);
    if (args.where?.type === 1) return sitemapPages.map(r => structuredClone(r));
    const where = args.where as { cid?: { notIn?: unknown; not?: unknown }; contentrelations?: { some?: unknown }; type?: unknown };
    if (where?.cid?.notIn !== undefined) return sectionRows.map(r => structuredClone(r));
    if (where?.cid?.not !== undefined) return relatedCandidates.map(r => structuredClone(r));
    if (where?.contentrelations?.some !== undefined) return photoRows.map(r => structuredClone(r));
    if (args.take === 1) return randomRows.map(r => structuredClone(r));
    return recentRows.map(r => structuredClone(r));
  });
}
registerContentFindMany();

// 随机文章
let randomTotal = 5;
let randomRows: Array<Record<string, unknown>> = [
  {
    cid: 400, title: "随机文", slug: "rand", desc: null,
    covers: JSON.stringify([]),
    contentrelations: [{ cid: 400, mid: 2, metas: { mid: 2, name: "笔记", slug: "note", type: "category" } }],
    travels: [{ travel_id: 3 }],
  },
];
sharedFake.on("contents", "count", async () => randomTotal);

// 相关文章
let relatedCurrent: Record<string, unknown> | null = {
  cid: 1,
  contentrelations: [{ mid: 1 }, { mid: 2 }],
};
sharedFake.on("contents", "findUnique", async () => relatedCurrent);

// 站点地图
const sitemapPages: Array<Record<string, unknown>> = [{ cid: 50, title: "关于", slug: "about" }];
let sitemapCategories: Array<Record<string, unknown>> = [
  { mid: 2, name: "笔记", slug: "note" },
  { mid: 3, name: "空分类", slug: "empty" },
];
const sitemapRelations: Array<Record<string, unknown>> = Array.from({ length: 6 }, (_, i) => ({
  mid: 2,
  content: { cid: i + 1, title: `文${i}`, slug: `s-${i}`, create_time: new Date(Date.UTC(2026, 0, i + 1)) },
}));
sharedFake.on("contents", "findFirst", async ({ where }: { where: Record<string, unknown> }) => {
  if (where?.slug === "messages") return guestbookRow;
  return null;
});
sharedFake.on("contentrelations", "findMany", async () => sitemapRelations.map(r => structuredClone(r)));

// 更新日志
const changelogRows: Array<Record<string, unknown>> = [
  { id: 2, content: JSON.stringify([{ type: "修复", value: "**修复甲**" }]), create_time: new Date(Date.UTC(2026, 2, 1)) },
  { id: 1, content: JSON.stringify([{ type: "功能", value: "功能乙" }]), create_time: new Date(Date.UTC(2026, 0, 1)) },
];
const seenChangelogArgs: Array<Record<string, unknown>> = [];
sharedFake.on("changelogs", "findMany", async (args: Record<string, unknown>) => {
  seenChangelogArgs.push(args);
  return changelogRows.map(r => structuredClone(r));
});

// 最近评论
let guestbookRow: { cid: number } | null = { cid: 88 };
const recentCommentRows: Array<Record<string, unknown>> = [
  { coid: 1, content: "留言一", name: "留者", mail: "l@x.com", create_time: new Date("2026-03-01T00:00:00Z"), content_ref: { cid: 88, title: "留言板", slug: "messages", status: 1, contentrelations: [] } },
  { coid: 2, content: "评论二", name: "评者", mail: null, create_time: new Date("2026-02-01T00:00:00Z"), content_ref: { cid: 1, title: "文章甲", slug: "post-a", status: 1, contentrelations: [{ metas: { slug: "note" } }] } },
  { coid: 3, content: "孤儿", name: "孤", mail: null, create_time: new Date("2026-01-03T00:00:00Z"), content_ref: null },
  { coid: 4, content: "草稿下评论", name: "草", mail: null, create_time: new Date("2026-01-02T00:00:00Z"), content_ref: { cid: 2, title: "草稿文", slug: "draft", status: 0, contentrelations: [{ metas: { slug: "note" } }] } },
  { coid: 5, content: "无分类", name: "无", mail: null, create_time: new Date("2026-01-01T00:00:00Z"), content_ref: { cid: 3, title: "无分类文", slug: "no-cat", status: 1, contentrelations: [] } },
];
const seenCommentArgs: Array<Record<string, unknown>> = [];
sharedFake.on("comments", "findMany", async (args: Record<string, unknown>) => {
  seenCommentArgs.push(args);
  return recentCommentRows.map(r => structuredClone(r));
});

const homeHandler = (await import("#server/api/home-data.get")).default;
const subscribesHandler = (await import("#server/api/subscribes.get")).default;
const randomHandler = (await import("#server/api/random-content.get")).default;
const relatedHandler = (await import("#server/api/related-contents/[cid].get")).default;
const sitemapHandler = (await import("#server/api/sitemap.get")).default;
const changelogsHandler = (await import("#server/api/changelogs.get")).default;
const recentCommentsHandler = (await import("#server/api/recent-comments.get")).default;
const messagesConfigHandler = (await import("#server/api/messages/config.get")).default;

function ev(peer: string, url = "/api/x") {
  return makeAuthEvent({ method: "GET", peer, url, headers: { host: "imqi1.com" } }).event;
}
function evh(peer: string, url = "/api/x") {
  return makeAuthEvent({ method: "GET", peer, url, headers: { host: "imqi1.com" } });
}

beforeEach(() => {
  photoCategorySlug = "photos";
  photoCategory = { mid: 9 };
  messageContentIdMeta = null;
  guestbookRow = { cid: 88 };
  randomTotal = 5;
  randomRows = [
    {
      cid: 400, title: "随机文", slug: "rand", desc: null,
      covers: JSON.stringify([]),
      contentrelations: [{ cid: 400, mid: 2, metas: { mid: 2, name: "笔记", slug: "note", type: "category" } }],
      travels: [{ travel_id: 3 }],
    },
  ];
  relatedCurrent = { cid: 1, contentrelations: [{ mid: 1 }, { mid: 2 }] };
  seenContentFindMany.length = 0;
  seenChangelogArgs.length = 0;
  seenCommentArgs.length = 0;
  seenMetasFindMany.length = 0;
});

describe("home-data.get", () => {
  test("六分区聚合:分类计数/最新/分区/图片/订阅/日志渲染", async () => {
    const { event, headers } = evh("10.5.0.1");
    const r = (await homeHandler(event)) as unknown as {
      success: boolean;
      data: {
        site: { photoCategorySlug: string };
        categories: Array<{ contentCount: number }>;
        recentContents: Array<{ cid: number; categories: unknown[] }>;
        categoryRecentContents: Array<{ category: { mid: number }; contents: unknown[] }>;
        photoContents: Array<{ covers: Array<{ width: number | null }> }>;
        subscribePosts: Array<{ title: string }>;
        changelogs: Array<{ content: Array<{ html: string }> }>;
      };
    };
    expect(r.success).toBe(true);
    expect(r.data.site.photoCategorySlug).toBe("photos");
    expect(r.data.categories.map(c => c.contentCount)).toEqual([5, 2]);
    expect(r.data.recentContents).toHaveLength(6);
    expect(r.data.categoryRecentContents[0]!.category.mid).toBe(2);
    expect(r.data.categoryRecentContents[0]!.contents[0]).toMatchObject({ cid: 200, travelCount: 1 });
    // 图片文封面经附件 metadata 补齐宽高
    expect(r.data.photoContents[0]!.covers[0]!.width).toBe(640);
    expect(r.data.subscribePosts).toHaveLength(3);
    expect(r.data.changelogs[0]!.content[0]!.html).toContain("<strong>修复甲</strong>");
    expect(headers["cache-control"]).toContain("max-age=300");
    // 排除图片分类:最新6与分区查询都要带 photoCategory 过滤
    expect(seenContentFindMany[0]!.where).toMatchObject({ type: 0, status: 1 });
  });

  test("未配置图片分类:photoContents 为空、分区不排除图片分类", async () => {
    photoCategorySlug = null;
    photoCategory = null;
    const r = (await homeHandler(ev("10.5.0.2"))) as unknown as { data: { photoContents: unknown[]; categoryRecentContents: unknown[] } };
    expect(r.data.photoContents).toEqual([]);
    expect(r.data.categoryRecentContents).toHaveLength(2);
  });

  test("DB 异常 → 500", async () => {
    sharedFake.on("metas", "findFirst", async () => {
      throw new Error("db down");
    });
    await expect(homeHandler(ev("10.5.0.3"))).rejects.toMatchObject({ statusCode: 500 });
    sharedFake.on("metas", "findFirst", async () => photoCategory);
  });
});

describe("subscribes.get", () => {
  test("默认全量 + 缓存头", async () => {
    const { event, headers } = evh("10.5.1.1");
    const r = (await subscribesHandler(event)) as unknown as { success: boolean; data: unknown[] };
    expect(r.success).toBe(true);
    expect(r.data).toHaveLength(3);
    expect(headers["cache-control"]).toContain("max-age=300");
  });

  test("limit 截断/钳制/非法回落", async () => {
    const r1 = (await subscribesHandler(ev("10.5.1.2", "/api/subscribes?limit=2"))) as unknown as { data: unknown[] };
    expect(r1.data).toHaveLength(2);
    const r2 = (await subscribesHandler(ev("10.5.1.3", "/api/subscribes?limit=abc"))) as unknown as { data: unknown[] };
    expect(r2.data).toHaveLength(3);
  });

  test("limit 为重复参数(数组) → 400", async () => {
    await expect(subscribesHandler(ev("10.5.1.4", "/api/subscribes?limit=a&limit=b"))).rejects.toMatchObject({ statusCode: 400 });
  });
});

describe("random-content.get", () => {
  test("随机返回:分类取 category 关系、travelCount、no-store 头", async () => {
    const { event, headers } = evh("10.5.2.1");
    const r = (await randomHandler(event)) as unknown as {
      success: boolean;
      data: { cid: number; category: { slug: string } | null; travelCount: number };
    };
    expect(r.success).toBe(true);
    expect(r.data.cid).toBe(400);
    expect(r.data.category!.slug).toBe("note");
    expect(r.data.travelCount).toBe(1);
    expect(headers["cache-control"]).toContain("no-store");
  });

  test("空库/取不到 → success:false", async () => {
    randomTotal = 0;
    const r = (await randomHandler(ev("10.5.2.2"))) as unknown as { success: boolean; data: unknown };
    expect(r.success).toBe(false);
    expect(r.data).toBeNull();
    randomTotal = 5;
    sharedFake.on("contents", "findMany", async () => []);
    const r2 = (await randomHandler(ev("10.5.2.3"))) as unknown as { success: boolean };
    expect(r2.success).toBe(false);
    registerContentFindMany();
  });

  test("DB 异常 → 500(不吞成 success:false)", async () => {
    sharedFake.on("contents", "count", async () => {
      throw new Error("db down");
    });
    await expect(randomHandler(ev("10.5.2.4"))).rejects.toMatchObject({ statusCode: 500 });
    sharedFake.on("contents", "count", async () => randomTotal);
  });
});

describe("related-contents/[cid].get", () => {
  test("非法 cid → 400", async () => {
    for (const cid of ["0", "abc", "-1", "1.5"]) {
      await expect(relatedHandler(makeAuthEvent({ method: "GET", peer: "10.5.3.1", params: { cid } }).event)).rejects.toMatchObject({ statusCode: 400 });
    }
  });

  test("当前文章不存在/无标签 → 空数组 + 缓存头", async () => {
    relatedCurrent = null;
    const r1 = (await relatedHandler(makeAuthEvent({ method: "GET", peer: "10.5.3.2", params: { cid: "1" } }).event)) as unknown as { success: boolean; data: unknown[] };
    expect(r1.data).toEqual([]);
    relatedCurrent = { cid: 1, contentrelations: [] };
    const r2 = (await relatedHandler(makeAuthEvent({ method: "GET", peer: "10.5.3.3", params: { cid: "1" } }).event)) as unknown as { data: unknown[] };
    expect(r2.data).toEqual([]);
  });

  test("按相关度排序再按时间;limit 截断;候选池 take", async () => {
    const r = (await relatedHandler(makeAuthEvent({ method: "GET", peer: "10.5.3.4", params: { cid: "1" }, url: "/api/related-contents/1?limit=2" }).event)) as unknown as {
      success: boolean;
      data: Array<{ cid: number }>;
    };
    expect(r.data.map(c => c.cid)).toEqual([2, 3]);
    // limit=1 只留相关度最高的 cid=2
    const r1 = (await relatedHandler(makeAuthEvent({ method: "GET", peer: "10.5.3.5", params: { cid: "1" }, url: "/api/related-contents/1?limit=1" }).event)) as unknown as { data: Array<{ cid: number }> };
    expect(r1.data.map(c => c.cid)).toEqual([2]);
    // 候选池:max(limit*4,20)=20
    expect(seenContentFindMany.at(-1)!.take).toBe(20);
  });

  test("limit 非法回落 3;越界钳到 100", async () => {
    await relatedHandler(makeAuthEvent({ method: "GET", peer: "10.5.3.6", params: { cid: "1" }, url: "/api/related-contents/1?limit=abc" }).event);
    expect(seenContentFindMany.at(-1)!.take).toBe(20);
    await relatedHandler(makeAuthEvent({ method: "GET", peer: "10.5.3.7", params: { cid: "1" }, url: "/api/related-contents/1?limit=500" }).event);
    expect(seenContentFindMany.at(-1)!.take).toBe(100);
  });
});

describe("sitemap.get", () => {
  test("页面 + 分类(最近5篇) + mid 不外泄", async () => {
    const r = (await sitemapHandler(ev("10.5.4.1"))) as unknown as {
      success: boolean;
      data: {
        pages: Array<Record<string, unknown>>;
        categories: Array<{ slug: string; contents: unknown[] }>;
      };
    };
    expect(r.success).toBe(true);
    expect(r.data.pages).toEqual([{ cid: 50, title: "关于", slug: "about" }]);
    const note = r.data.categories.find(c => c.slug === "note")!;
    expect(note.contents).toHaveLength(5);
    expect(r.data.categories.find(c => c.slug === "empty")!.contents).toEqual([]);
    expect(JSON.stringify(r)).not.toContain('"mid"');
  });

  test("无分类时不查关系表", async () => {
    sitemapCategories = [];
    seenContentFindMany.length = 0;
    const r = (await sitemapHandler(ev("10.5.4.2"))) as unknown as { data: { categories: unknown[] } };
    expect(r.data.categories).toEqual([]);
  });
});

describe("changelogs.get", () => {
  test("按年月分组倒序;渲染 html 不回传 value", async () => {
    const r = (await changelogsHandler(ev("10.5.5.1"))) as unknown as {
      success: boolean;
      data: Array<{ year: number; month: number; logs: Array<{ id: number; content: Array<{ type: string; html: string }> }> }>;
    };
    expect(r.success).toBe(true);
    expect(r.data[0]).toMatchObject({ year: 2026, month: 3 });
    expect(r.data[0]!.logs[0]!.id).toBe(2);
    expect(r.data[0]!.logs[0]!.content[0]).toMatchObject({ type: "修复", html: expect.stringContaining("<strong>修复甲</strong>") });
    expect(JSON.stringify(r)).not.toContain('"value"');
  });

  test("simple=true 返回扁平数组;limit 生效", async () => {
    const r = (await changelogsHandler(ev("10.5.5.2", "/api/changelogs?simple=true&limit=1"))) as unknown as { data: unknown[] };
    expect(Array.isArray(r.data)).toBe(true);
    expect(seenChangelogArgs.at(-1)!.take).toBe(1);
  });

  test("limit 非法回落 1;缓存头", async () => {
    const { event, headers } = evh("10.5.5.3", "/api/changelogs?limit=abc");
    await changelogsHandler(event);
    expect(seenChangelogArgs.at(-1)!.take).toBe(1);
    expect(headers["cache-control"]).toContain("max-age=300");
  });
});

describe("recent-comments.get", () => {
  test("过滤无效评论 + 留言板走 /messages + 文章拼 /content 链接", async () => {
    const r = (await recentCommentsHandler(ev("10.5.6.1"))) as unknown as {
      code: number;
      data: Array<{ coid: number; avatar: string; contents: { title: string; url: string } }>;
    };
    expect(r.code).toBe(200);
    // c1 留言板放行、c2 正常文章、c3/c4/c5 被过滤
    expect(r.data.map(c => c.coid)).toEqual([1, 2]);
    expect(r.data[0]!.contents.url).toBe("/messages");
    expect(r.data[0]!.contents.title).toBe("留言板");
    expect(r.data[1]!.contents.url).toBe("/content/note/post-a");
    // gravatar 头像按 mail 的 md5 拼装
    expect(r.data[0]!.avatar).toContain("gravatar");
    // take = limit*2
    expect(seenCommentArgs.at(-1)!.take).toBe(40);
  });

  test("limit 生效", async () => {
    const r = (await recentCommentsHandler(ev("10.5.6.2", "/api/recent-comments?limit=1"))) as unknown as { data: unknown[] };
    expect(r.data).toHaveLength(1);
    expect(seenCommentArgs.at(-1)!.take).toBe(2);
  });

  test("留言板未配置:文章评论仍在、留言板评论被过滤", async () => {
    guestbookRow = null;
    const r = (await recentCommentsHandler(ev("10.5.6.3"))) as unknown as { data: Array<{ coid: number }> };
    expect(r.data.map(c => c.coid)).toEqual([2]);
  });
});

describe("messages/config.get", () => {
  test("优先 meta 配置的 cid", async () => {
    messageContentIdMeta = "88";
    const r = (await messagesConfigHandler(ev("10.5.7.1"))) as unknown as { code: number; data: { contentId: number } };
    expect(r.code).toBe(200);
    expect(r.data.contentId).toBe(88);
  });

  test("meta 非法数值回退 slug 查找", async () => {
    messageContentIdMeta = "abc";
    const r = (await messagesConfigHandler(ev("10.5.7.2"))) as unknown as { data: { contentId: number } };
    expect(r.data.contentId).toBe(88);
  });

  test("完全未配置 → code 404", async () => {
    messageContentIdMeta = null;
    guestbookRow = null;
    const r = (await messagesConfigHandler(ev("10.5.7.3"))) as unknown as { code: number; message: string };
    expect(r.code).toBe(404);
    expect(r.message).toContain("留言板未配置");
  });
});
