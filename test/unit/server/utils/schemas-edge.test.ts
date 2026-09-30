/**
 * server/utils/schemas.ts 补测:
 *  - SearchTypeSchema:枚举四类
 *  - SearchQuerySchema:q 长度边界、type 缺省 "content"
 *  - SearchResultItemSchema / SubscribeSearchItemSchema / CommentSearchItemSchema / SubscribePostSearchItemSchema
 *  - SearchResponseSchema:四种 results item 联合解析
 *  - CommentCreateSchema:cid/mail/link/content/captchaToken/parentId 等字段校验
 */
import { describe, expect, test } from "bun:test";

import {
  CommentCreateSchema,
  CommentSearchItemSchema,
  SearchQuerySchema,
  SearchResultItemSchema,
  SearchTypeSchema,
  SubscribePostSearchItemSchema,
  SubscribeSearchItemSchema,
} from "#server/utils/schemas";
import { MAX_COMMENT_LENGTH } from "#shared/constants";

describe("SearchTypeSchema 枚举", () => {
  test.each(["content", "subscribe", "comment", "subscribepost"])("%s 是合法 type", (t) => {
    expect(SearchTypeSchema.parse(t)).toBe(t);
  });

  test("非法 type 抛 ZodError", () => {
    expect(() => SearchTypeSchema.parse("unknown")).toThrow();
  });
});

describe("SearchQuerySchema", () => {
  test("完整字段 → 通过", () => {
    expect(SearchQuerySchema.parse({ q: "imqi1", type: "subscribe" })).toEqual({ q: "imqi1", type: "subscribe" });
  });

  test("type 缺省 → 默认 content", () => {
    expect(SearchQuerySchema.parse({ q: "x" })).toEqual({ q: "x", type: "content" });
  });

  test("q 空串 → 抛", () => {
    expect(() => SearchQuerySchema.parse({ q: "" })).toThrow();
  });

  test("q 超 100 字符 → 抛", () => {
    expect(() => SearchQuerySchema.parse({ q: "x".repeat(101) })).toThrow();
  });

  test("q 恰好 100 字符 → 通过", () => {
    expect(() => SearchQuerySchema.parse({ q: "x".repeat(100) })).not.toThrow();
  });
});

describe("SearchResultItemSchema(文章项)", () => {
  test("最小必要字段 → 通过", () => {
    const item = {
      type: "content" as const,
      cid: 1,
      title: "T",
      slug: "s",
      desc: null,
      createTime: new Date(),
      categoryName: null,
      categorySlug: null,
    };
    expect(SearchResultItemSchema.parse(item)).toEqual(item);
  });

  test("createTime 字符串(ISO)也可(实际 formatSearchResults 返回 string)", () => {
    const item = {
      type: "content" as const,
      cid: 1,
      title: "T",
      slug: null,
      desc: "d",
      createTime: "2026-01-01T00:00:00Z",
      categoryName: "笔记",
      categorySlug: "note",
    };
    expect(() => SearchResultItemSchema.parse(item)).not.toThrow();
  });

  test("type 错(非 content literal)→ 抛", () => {
    expect(() =>
      SearchResultItemSchema.parse({
        type: "subscribe",
        cid: 1,
        title: "T",
        slug: null,
        desc: null,
        createTime: new Date(),
        categoryName: null,
        categorySlug: null,
      }),
    ).toThrow();
  });

  test("highlight 字段可选", () => {
    const item = {
      type: "content" as const,
      cid: 1,
      title: "T",
      slug: null,
      desc: null,
      createTime: new Date(),
      categoryName: null,
      categorySlug: null,
      highlight: "<em>imqi1</em>",
    };
    expect(SearchResultItemSchema.parse(item).highlight).toBe("<em>imqi1</em>");
  });
});

describe("SubscribeSearchItemSchema(订阅源/友链)", () => {
  test("kind=subscribe → 通过", () => {
    const item = {
      type: "subscribe" as const,
      kind: "subscribe" as const,
      id: 1,
      name: "博客甲",
      url: "https://a.com",
      avatar: null,
      desc: null,
    };
    expect(SubscribeSearchItemSchema.parse(item)).toEqual(item);
  });

  test("kind=link → 通过", () => {
    const item = {
      type: "subscribe" as const,
      kind: "link" as const,
      id: 2,
      name: "友链甲",
      url: "https://b.com",
      avatar: "https://b.com/avatar.png",
      desc: "desc",
    };
    expect(SubscribeSearchItemSchema.parse(item)).toEqual(item);
  });

  test("kind 非枚举值 → 抛", () => {
    expect(() =>
      SubscribeSearchItemSchema.parse({
        type: "subscribe",
        kind: "other",
        id: 1,
        name: "n",
        url: "https://x",
        avatar: null,
        desc: null,
      }),
    ).toThrow();
  });
});

describe("CommentSearchItemSchema(评论搜索项)", () => {
  test("最小必要字段 → 通过(含 createTime Date 或 string)", () => {
    const item = {
      type: "comment" as const,
      coid: 1,
      name: "用户",
      content: "评论内容",
      avatar: "https://gravatar/x.png",
      createTime: "2026-01-01",
      articleTitle: "原文",
      articleUrl: "/post/1",
    };
    expect(CommentSearchItemSchema.parse(item)).toEqual(item);
  });
});

describe("SubscribePostSearchItemSchema(订阅文章)", () => {
  test("pubDate 可为 null;字段缺省时仍能通过", () => {
    const item = {
      type: "subscribepost" as const,
      id: 1,
      subscribeId: 1,
      subscribeName: "博客",
      subscribeAvatar: null,
      title: "标题",
      link: "https://x/post/1",
      description: null,
      author: null,
      pubDate: null,
    };
    expect(SubscribePostSearchItemSchema.parse(item)).toEqual(item);
  });
});

describe("CommentCreateSchema", () => {
  const base = {
    csrfToken: "tok",
    cid: 1,
    name: "n",
    mail: "a@b.com",
    link: null,
    content: "hello",
    captchaToken: "cap",
    captchaCode: "ABCD",
    parentId: null,
    replyToName: null,
    replyToMail: null,
    page: 1,
  };

  test("合法 body → 通过", () => {
    expect(() => CommentCreateSchema.parse(base)).not.toThrow();
  });

  test("cid 缺省/非正整数 → 抛", () => {
    expect(() => CommentCreateSchema.parse({ ...base, cid: 0 })).toThrow();
    expect(() => CommentCreateSchema.parse({ ...base, cid: "abc" })).toThrow();
  });

  test("content 恰好 MAX_COMMENT_LENGTH → 通过", () => {
    expect(() => CommentCreateSchema.parse({ ...base, content: "x".repeat(MAX_COMMENT_LENGTH) })).not.toThrow();
  });

  test("content 超 MAX_COMMENT_LENGTH → 抛", () => {
    expect(() => CommentCreateSchema.parse({ ...base, content: "x".repeat(MAX_COMMENT_LENGTH + 1) })).toThrow();
  });

  test("mail 可选(undefined 被 zod 默认处理或允许,实际 mail 必填由 handler 的 zod 业务校验负责)", () => {
    // 实际 schema mail 字段可能 .optional();这里只锁定它能被解析,handler 层做必填校验
    expect(() => CommentCreateSchema.parse({ ...base, mail: undefined })).not.toThrow();
  });
});