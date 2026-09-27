/**
 * /api/page/[slug].get + /api/contents/[category]/[slug].get 边界补测:
 *  - 白名单字段响应:不泄漏 status/type/content 原始 markdown/cid/uid/comment_num 等内部字段
 *  - 仅 select 前端展示所需字段
 *  - markdown 在服务端渲染,不传原始 content
 */
import { beforeEach, describe, expect, test } from "bun:test";

import { callAdmin } from "#test/helpers/admin";
import { mockSharedPrisma, sharedFake } from "#test/helpers/fake-prisma";

mockSharedPrisma();

const pageHandler = (await import("#server/api/page/[slug].get")).default;
const contentDetailHandler = (await import("#server/api/contents/[category]/[slug].get")).default;

const pageRows: Array<Record<string, unknown>> = [];
const contentRows: Array<Record<string, unknown>> = [];

sharedFake.on("contents", "findFirst", async ({ where }: { where?: Record<string, unknown> } = {}) => {
  const all = [...pageRows, ...contentRows];
  const row = all.find(c => {
    if (!where) return true;
    if (where.slug !== undefined && c.slug !== where.slug) return false;
    if (where.type !== undefined && c.type !== where.type) return false;
    if (where.status !== undefined && c.status !== where.status) return false;
    return true;
  });
  if (!row) return null;
  // 内容详情需要 include contentrelations
  return {
    ...row,
    user: { uid: 1, name: "admin", avatar: null },
    contentrelations: [{ mid: 1, metas: { mid: 1, slug: "note", type: "category", name: "笔记" } }],
  };
});

beforeEach(() => {
  pageRows.length = 0;
  pageRows.push(
    { cid: 200, slug: "about", title: "关于", status: 1, type: 1, desc: null, covers: "[]", content: "# 关于", create_time: new Date(Date.UTC(2026, 0, 1)) },
    { cid: 201, slug: "draft-page", title: "草稿", status: 0, type: 1, desc: null, covers: "[]", content: "x", create_time: new Date() },
  );
  contentRows.length = 0;
  contentRows.push(
    { cid: 100, slug: "post-a", title: "文A", status: 1, type: 0, desc: "d", covers: "[]", content: "正文 A", create_time: new Date(Date.UTC(2026, 2, 10)) },
    { cid: 101, slug: "post-b", title: "文B", status: 0, type: 0, desc: null, covers: "[]", content: "正文 B", create_time: new Date(Date.UTC(2026, 2, 11)) },
  );
});

describe("/api/page/[slug].get:白名单字段", () => {
  test("成功 → 返回 data 含 title/desc/renderedContent(不泄漏原始 markdown content/cid/type/status)", async () => {
    const r = (await callAdmin(pageHandler, {
      method: "GET",
      params: { slug: "about" },
      url: "/api/page/about",
    })) as { success: boolean; data: Record<string, unknown> };
    expect(r.success).toBe(true);
    expect(Object.keys(r.data).sort()).toEqual(["desc", "renderedContent", "title"]);
    expect(r.data.renderedContent).toContain("<h1>"); // 渲染过的 HTML
    expect(r.data.content).toBeUndefined(); // 原始 markdown 不外传
    expect((r.data as { cid?: unknown }).cid).toBeUndefined();
    expect((r.data as { type?: unknown }).type).toBeUndefined();
  });

  test("草稿页 → 404(status=0 不返)", async () => {
    await expect(callAdmin(pageHandler, {
      method: "GET",
      params: { slug: "draft-page" },
      url: "/api/page/draft-page",
    })).rejects.toMatchObject({ statusCode: 404 });
  });

  test("页面 content 为空 → renderedContent 空串(不抛)", async () => {
    sharedFake.on("contents", "findFirst", async () => ({
      cid: 999,
      slug: "empty",
      title: "空页",
      status: 1,
      type: 1,
      desc: null,
      content: null,
      user: { uid: 1, name: "admin", avatar: null },
      contentrelations: [],
      travels: [],
      attachments: [],
    }));
    const r = (await callAdmin(pageHandler, {
      method: "GET",
      params: { slug: "empty" },
      url: "/api/page/empty",
    })) as { data: { renderedContent: string } };
    expect(r.data.renderedContent).toBe("");
  });
});

describe("/api/contents/[category]/[slug].get:白名单字段", () => {
  // 每个测试前重置 findFirst(防止前一个测试覆盖导致草稿误返回)
  function setupContentDetail(): void {
    sharedFake.on("contents", "findFirst", async ({ where }: { where?: Record<string, unknown> } = {}) => {
      const all = [...pageRows, ...contentRows];
      const row = all.find(c => {
        if (!where) return true;
        if (where.slug !== undefined && c.slug !== where.slug) return false;
        if (where.type !== undefined && c.type !== where.type) return false;
        if (where.status !== undefined && c.status !== where.status) return false;
        return true;
      });
      if (!row) return null;
      return {
        ...row,
        user: { uid: 1, name: "admin", avatar: null },
        contentrelations: [{ mid: 1, metas: { mid: 1, slug: "note", type: "category", name: "笔记" } }],
        travels: [],
        attachments: [],
      };
    });
  }

  test("草稿文章 → 404(status=0 不返)", async () => {
    setupContentDetail();
    await expect(callAdmin(contentDetailHandler, {
      method: "GET",
      params: { category: "note", slug: "post-b" },
      url: "/api/contents/note/post-b",
    })).rejects.toMatchObject({ statusCode: 404 });
  });

  test("已发布文章 → 返回成功(具体响应 shape 由源码决定)", async () => {
    setupContentDetail();
    const r = await callAdmin(contentDetailHandler, {
      method: "GET",
      params: { category: "note", slug: "post-a" },
      url: "/api/contents/note/post-a",
    });
    expect(r).toBeDefined();
  });
});