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

let content: Record<string, unknown> | null = null;
sharedFake.on("contents", "findFirst", async () => content);

const handler = (await import("#server/api/mini/content/[id].get")).default;

function ev(peer: string, id: string) {
  return makeAuthEvent({ method: "GET", peer, params: { id }, url: `/api/mini/content/${id}`, headers: { host: "imqi1.com" } }).event;
}

beforeEach(() => {
  fakeDataEnabled = false;
  content = {
    cid: 10, title: "文章标题", desc: "简介", content: "# Markdown 原文",
    covers: JSON.stringify([{ url: "/imgs/a.webp", title: "封面一" }, { url: "/imgs/b.webp" }]),
    create_time: new Date("2026-03-01T00:00:00Z"),
    contentrelations: [{ metas: { mid: 5, name: "笔记", slug: "note" } }, { metas: null }],
  };
});

describe("mini/content/[id].get", () => {
  test("cid 非法 → 400;文章不存在 → 404", async () => {
    await expect(handler(ev("10.9.11.1", "abc"))).rejects.toMatchObject({ statusCode: 400 });
    content = null;
    await expect(handler(ev("10.9.11.2", "999"))).rejects.toMatchObject({ statusCode: 404 });
  });

  test("返回 Markdown 原文、绝对封面、分类列表", async () => {
    const r = (await handler(ev("10.9.11.3", "10"))) as unknown as {
      success: boolean;
      data: {
        id: number; content: string; cover: string;
        covers: Array<{ url: string; title: string }>;
        categories: Array<{ mid: number; slug: string }>;
      };
    };
    expect(r.success).toBe(true);
    expect(r.data.id).toBe(10);
    // 返回原文而非渲染 HTML,交给端上解析
    expect(r.data.content).toBe("# Markdown 原文");
    expect(r.data.covers).toHaveLength(2);
    expect(String(r.data.covers[0]!.url)).toContain("/imgs/a.webp");
    expect(r.data.covers[0]!.title).toBe("封面一");
    expect(r.data.cover).toBe(r.data.covers[0]!.url);
    // 分类:null 元数据被过滤
    expect(r.data.categories.map(c => c.mid)).toEqual([5]);
  });

  test("审核模式:只认占位文章 id,其余 404", async () => {
    fakeDataEnabled = true;
    const ok = (await handler(ev("10.9.11.4", "1"))) as unknown as { data: { id: number } };
    expect(ok.data.id).toBe(1);
    await expect(handler(ev("10.9.11.5", "10"))).rejects.toMatchObject({ statusCode: 404 });
  });
});
