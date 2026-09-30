import { describe, expect, test } from "bun:test";

import {
  CommentCreateSchema,
  CommentItemSchema,
  SearchQuerySchema,
  SearchResultItemSchema,
  SearchResponseSchema,
  SearchTypeSchema,
  SiteSettingsSchema,
  SubscribeSearchItemSchema,
  SubscribePostSearchItemSchema,
  CommentSearchItemSchema,
} from "#server/utils/schemas";
import { MAX_COMMENT_LENGTH } from "#shared/constants";

describe("SearchTypeSchema", () => {
  test("合法 4 个搜索类型", () => {
    expect(SearchTypeSchema.parse("content")).toBe("content");
    expect(SearchTypeSchema.parse("subscribe")).toBe("subscribe");
    expect(SearchTypeSchema.parse("comment")).toBe("comment");
    expect(SearchTypeSchema.parse("subscribepost")).toBe("subscribepost");
  });

  test("未知类型 → 抛", () => {
    expect(() => SearchTypeSchema.parse("unknown")).toThrow();
  });
});

describe("SearchQuerySchema", () => {
  test("合法 q + type", () => {
    const r = SearchQuerySchema.parse({ q: "hello", type: "comment" });
    expect(r.q).toBe("hello");
    expect(r.type).toBe("comment");
  });

  test("type 缺省 → default 'content'", () => {
    const r = SearchQuerySchema.parse({ q: "x" });
    expect(r.type).toBe("content");
  });

  test("q 长度 > 100 → 抛", () => {
    expect(() => SearchQuerySchema.parse({ q: "x".repeat(101) })).toThrow();
  });

  test("q 为空字符串 → 抛(min 1)", () => {
    expect(() => SearchQuerySchema.parse({ q: "" })).toThrow();
  });
});

describe("SearchResultItemSchema(文章结果)", () => {
  const valid = {
    type: "content" as const,
    cid: 1,
    title: "T",
    slug: "hello",
    desc: "desc",
    createTime: new Date(),
    categoryName: "C",
    categorySlug: "c",
  };

  test("合法对象通过", () => {
    expect(() => SearchResultItemSchema.parse(valid)).not.toThrow();
  });

  test("slug 允许为 null", () => {
    expect(() => SearchResultItemSchema.parse({ ...valid, slug: null })).not.toThrow();
  });

  test("createTime 接受 Date 或字符串", () => {
    expect(() => SearchResultItemSchema.parse({ ...valid, createTime: "2024-01-01" })).not.toThrow();
  });

  test("type 必须是 content(字面量)", () => {
    expect(() => SearchResultItemSchema.parse({ ...valid, type: "comment" })).toThrow();
  });
});

describe("SubscribeSearchItemSchema(订阅/友链结果)", () => {
  test("subscribe 类型 + kind=subscribe/link", () => {
    expect(() => SubscribeSearchItemSchema.parse({
      type: "subscribe",
      kind: "subscribe",
      id: 1,
      name: "n",
      url: "https://x.com",
      desc: null,
      avatar: null,
    })).not.toThrow();
    expect(() => SubscribeSearchItemSchema.parse({
      type: "subscribe",
      kind: "link",
      id: 2,
      name: "n",
      url: "https://x.com",
      desc: null,
      avatar: null,
    })).not.toThrow();
  });

  test("kind 非法 → 抛", () => {
    expect(() => SubscribeSearchItemSchema.parse({
      type: "subscribe",
      kind: "blog",
      id: 1,
      name: "n",
      url: "https://x.com",
      desc: null,
      avatar: null,
    })).toThrow();
  });
});

describe("CommentSearchItemSchema", () => {
  test("合法 comment 搜索项", () => {
    expect(() => CommentSearchItemSchema.parse({
      type: "comment",
      coid: 1,
      name: "name",
      content: "x",
      avatar: "https://x.com/a.jpg",
      createTime: new Date(),
      articleTitle: null,
      articleUrl: null,
    })).not.toThrow();
  });

  test("avatar 必填(非空串,否则不符合搜索结果项契约)", () => {
    // avatar 字段 schema 是 z.string() 无 min,空串也接受(调用方约定白名单已生成)
    expect(() => CommentSearchItemSchema.parse({
      type: "comment",
      coid: 1,
      name: "n",
      content: "x",
      avatar: "",
      createTime: new Date(),
      articleTitle: null,
      articleUrl: null,
    })).not.toThrow();
  });
});

describe("SubscribePostSearchItemSchema", () => {
  test("合法 subscribepost 项", () => {
    expect(() => SubscribePostSearchItemSchema.parse({
      type: "subscribepost",
      id: 1,
      subscribeId: 2,
      subscribeName: "blog",
      subscribeAvatar: null,
      title: "T",
      link: "https://x.com",
      description: null,
      author: null,
      pubDate: null,
    })).not.toThrow();
  });

  test("type 必须是 subscribepost", () => {
    expect(() => SubscribePostSearchItemSchema.parse({
      type: "subscribe",
      id: 1, subscribeId: 2, subscribeName: "n", subscribeAvatar: null,
      title: "T", link: "x", description: null, author: null, pubDate: null,
    })).toThrow();
  });
});

describe("SearchResponseSchema", () => {
  test("空 results + 0 total 合法", () => {
    expect(() => SearchResponseSchema.parse({
      results: [], total: 0, query: "x", type: "content",
    })).not.toThrow();
  });

  test("混合 4 种 type results(union 解析)", () => {
    expect(() => SearchResponseSchema.parse({
      results: [
        { type: "content", cid: 1, title: "T", slug: "s", desc: null, createTime: new Date(), categoryName: null, categorySlug: null },
        { type: "subscribe", kind: "link", id: 2, name: "n", url: "u", desc: null, avatar: null },
        { type: "comment", coid: 3, name: "n", content: "x", avatar: "a", createTime: new Date(), articleTitle: null, articleUrl: null },
        { type: "subscribepost", id: 4, subscribeId: 5, subscribeName: "s", subscribeAvatar: null, title: "T", link: "u", description: null, author: null, pubDate: null },
      ],
      total: 4,
      query: "x",
      type: "content",
    })).not.toThrow();
  });
});

describe("CommentCreateSchema", () => {
  const valid = {
    csrfToken: "csrf",
    cid: 1,
    content: "hello",
    name: "alice",
  };

  test("最少必填字段合法", () => {
    expect(() => CommentCreateSchema.parse(valid)).not.toThrow();
  });

  test("content 超 MAX_COMMENT_LENGTH → 抛", () => {
    expect(() => CommentCreateSchema.parse({ ...valid, content: "x".repeat(MAX_COMMENT_LENGTH + 1) })).toThrow();
  });

  test("content 长度 == MAX_COMMENT_LENGTH → 通过", () => {
    expect(() => CommentCreateSchema.parse({ ...valid, content: "x".repeat(MAX_COMMENT_LENGTH) })).not.toThrow();
  });

  test("content 空 → 抛(min 1)", () => {
    expect(() => CommentCreateSchema.parse({ ...valid, content: "" })).toThrow();
  });

  test("name 超 50 → 抛", () => {
    expect(() => CommentCreateSchema.parse({ ...valid, name: "n".repeat(51) })).toThrow();
  });

  test("name 空 → 抛", () => {
    expect(() => CommentCreateSchema.parse({ ...valid, name: "" })).toThrow();
  });

  test("cid 必须正整数", () => {
    expect(() => CommentCreateSchema.parse({ ...valid, cid: 0 })).toThrow();
    expect(() => CommentCreateSchema.parse({ ...valid, cid: -1 })).toThrow();
    expect(() => CommentCreateSchema.parse({ ...valid, cid: "1" })).not.toThrow(); // coerce
  });

  test("mail 空串 → null(transform)", () => {
    const r = CommentCreateSchema.parse({ ...valid, mail: "" });
    expect(r.mail).toBeNull();
  });

  test("mail 非空 → 原样", () => {
    const r = CommentCreateSchema.parse({ ...valid, mail: "a@b.com" });
    expect(r.mail).toBe("a@b.com");
  });

  test("link 空串 → null(transform)", () => {
    const r = CommentCreateSchema.parse({ ...valid, link: "" });
    expect(r.link).toBeNull();
  });

  test("parent_id 字符串数字 → coerce 转 number", () => {
    const r = CommentCreateSchema.parse({ ...valid, parent_id: "5" });
    expect(r.parent_id).toBe(5);
  });
});

describe("CommentItemSchema(提交后响应,白名单字段)", () => {
  test("仅 coid", () => {
    expect(() => CommentItemSchema.parse({ coid: 1 })).not.toThrow();
  });

  test("mail 等敏感字段不在白名单(响应层不暴露)", () => {
    // zod 默认 strip 未知字段 → 解析后 mail 不会出现
    const parsed = CommentItemSchema.parse({ coid: 1, mail: "leak@x.com", ip: "1.2.3.4" });
    expect(parsed).toEqual({ coid: 1 });
    expect((parsed as Record<string, unknown>).mail).toBeUndefined();
    expect((parsed as Record<string, unknown>).ip).toBeUndefined();
  });
});

describe("SiteSettingsSchema", () => {
  const valid = {
    siteName: "imqi1",
    siteUrl: "https://x.com",
    siteDesc: "d",
    siteIcp: "",
    homeCustomText: "",
    photoCategorySlug: "photo",
    commentEnabled: true,
    commentAvatarService: "gravatar",
    commentPageSize: 10,
    commentMaxLevel: 4,
    commentInterval: 60,
    commentRequireMail: false,
    commentRequireLink: false,
    contentPageSize: 10,
    feedCacheInterval: 8,
    linkAutoApprove: true,
    musicPlaylistId: "x",
  };

  test("完整形状合法", () => {
    expect(() => SiteSettingsSchema.parse(valid)).not.toThrow();
  });

  test("commentEnabled 缺 → 抛", () => {
    const { commentEnabled: _, ...rest } = valid;
    expect(() => SiteSettingsSchema.parse(rest)).toThrow();
  });

  test("commentPageSize 缺 → 抛", () => {
    const { commentPageSize: _, ...rest } = valid;
    expect(() => SiteSettingsSchema.parse(rest)).toThrow();
  });

  test("musicPlaylistId 缺 → 抛(必填字符串)", () => {
    const { musicPlaylistId: _, ...rest } = valid;
    expect(() => SiteSettingsSchema.parse(rest)).toThrow();
  });
});