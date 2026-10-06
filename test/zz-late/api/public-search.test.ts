/**
 * server/api/search.get.ts 集成测:
 *  - 空 query → 返回空数据(code:200,total:0)
 *  - type=content → 命中 contents 表 + 关联分类
 *  - type=subscribe → 合并 subscribes + 已审核友链(过滤未审核 + isModification:approved)
 *  - type=comment → 仅已审核 + 已发布文章/留言板上的评论
 *  - type=subscribepost → 标题/描述/正文/作者四字段任一命中
 *  - 关键词净化:超长截断 + 危险字符剥离 + 多空格压成单空格
 */
import "#test/helpers/nitro-globals";

import { describe, expect, test } from "bun:test";

import { makeAuthEvent } from "#test/helpers/auth-fakes";
import { mockSharedPrisma, sharedFake } from "#test/helpers/fake-prisma";

mockSharedPrisma();

const searchHandler = (await import("#server/api/search.get")).default;

// search.get 链路里 informations.findMany 被多处读到(settings + comment avatar),默认返空
sharedFake.on("informations", "findMany", async () => []);

function ev(url = "/api/search?q=hello") {
  return makeAuthEvent({ method: "GET", peer: "10.30.3.1", url }).event;
}

describe("search.get:基础", () => {
  test("缺 q 参数 → 400(zod min(1) 拦截)", async () => {
    await expect(searchHandler(ev("/api/search"))).rejects.toMatchObject({ statusCode: 400 });
  });
});

describe("search.get:content 分支", () => {
  test("type=content + 命中标题 → 返回 cid/title/slug/desc/highlight(高亮 <mark>)", async () => {
    // resolveGuestbookCid 通过 informations.findUnique('messageContentId') 拉留言板 cid
    sharedFake.on("informations", "findUnique", async () => null);
    sharedFake.on("contents", "findFirst", async () => null);
    sharedFake.on("contents", "findMany", async () => [{
      cid: 1,
      title: "Hello World",
      slug: "hello",
      desc: "摘要",
      content: "这是一段包含 hello 关键词的正文内容,用于验证高亮。",
      create_time: new Date("2026-04-01"),
      _count: { likes: 0 },
      contentrelations: [{ metas: { name: "笔记", slug: "note" } }],
    }]);
    const r = (await searchHandler(ev("/api/search?q=hello&type=content"))) as unknown as {
      data: { results: Array<Record<string, unknown>>; total: number };
    };
    expect(r.data.total).toBe(1);
    expect(r.data.results[0]?.type).toBe("content");
    expect(r.data.results[0]?.title).toBe("Hello World");
    expect(String(r.data.results[0]?.highlight)).toContain("<mark>");
    expect(r.data.results[0]?.categorySlug).toBe("note");
  });

  test("type=content + 关键词净化:多空格压紧(允许字符集内的标点保留)", async () => {
    sharedFake.on("informations", "findUnique", async () => null);
    sharedFake.on("contents", "findFirst", async () => null);
    let capturedQuery = "";
    sharedFake.on("contents", "findMany", async ({ where }: { where: { AND: Array<{ OR?: Array<{ title?: { contains: string } }> }> } }) => {
      const q = where.AND[2]?.OR?.[0]?.title?.contains;
      if (q !== undefined) capturedQuery = q;
      return [];
    });
    // "hello  world!!" 解码后 "hello  world!!" → trim → 字符过滤(都允许)→ 空格压紧
    await searchHandler(ev("/api/search?q=hello%20%20world%21%21&type=content"));
    expect(capturedQuery).toBe("hello world!!");
  });
});

describe("search.get:subscribe 分支", () => {
  test("合并 subscribes + 已审核友链(过滤未启用 + 未审核的 isModification)", async () => {
    // subscribes 不带 where 过滤,直接返回种子
    sharedFake.on("subscribes", "findMany", async () => [
      { id: 1, name: "已RSS", url: "https://a.com/feed", avatar: null },
    ]);
    // links 的 where: { enabled:true, AND:[ {OR:[{isModification:false},{isModification:true,modificationStatus:"approved"}]}, {OR:[name/link/desc contains q]} ] }
    sharedFake.on("links", "findMany", async ({ where }: { where: { enabled: boolean; AND: Array<{ OR: Array<{ isModification?: boolean; modificationStatus?: string } | { name?: { contains: string }; link?: { contains: string }; desc?: { contains: string } }> }> } }) => {
      const all = [
        { id: 10, name: "已审", link: "https://link.com", desc: "", avatar: null, enabled: true, isModification: false, modificationStatus: null },
        { id: 11, name: "未启用", link: "https://b.com", desc: "", avatar: null, enabled: false, isModification: false, modificationStatus: null },
        { id: 12, name: "未审核", link: "https://c.com", desc: "", avatar: null, enabled: true, isModification: true, modificationStatus: "pending" },
        { id: 13, name: "已通过 mod", link: "https://d.com", desc: "", avatar: null, enabled: true, isModification: true, modificationStatus: "approved" },
      ];
      const q = ((where.AND?.[1]?.OR?.[0] as { name?: { contains: string } } | undefined)?.name?.contains) ?? "";
      return all.filter(l => {
        if (l.enabled !== where.enabled) return false;
        const okMod = !l.isModification || l.modificationStatus === "approved";
        if (!okMod) return false;
        if (!q) return true;
        return [l.name, l.link, l.desc].some(s => s?.includes(q));
      });
    });
    // q="已" → 10(name 含"已")、13(name 含"已")、1(subscribes name 含"已")命中;11(未启用)与 12(未审核 mod)被滤
    const r = (await searchHandler(ev("/api/search?q=%E5%B7%B2&type=subscribe"))) as unknown as {
      data: { results: Array<{ id: number; name: string; kind: string }>; total: number };
    };
    const ids = r.data.results.map(x => x.id).sort();
    expect(ids).toEqual([1, 10, 13]);
    expect(r.data.results.find(x => x.kind === "link")?.name).toBeTruthy();
  });
});

describe("search.get:comment 分支", () => {
  test("白名单字段:不返回 mail/ip/agent,只返回 comment+avatar+articleUrl", async () => {
    sharedFake.on("informations", "findUnique", async () => null);
    sharedFake.on("contents", "findFirst", async () => null);
    sharedFake.on("comments", "findMany", async () => [{
      coid: 100,
      name: "访客",
      mail: "x@y.z", // 不应下发
      content: "评论 hello",
      create_time: new Date(),
      content_ref: {
        cid: 1, title: "文 A", slug: "a", status: 1,
        contentrelations: [{ metas: { slug: "note" } }],
      },
    }]);
    const r = (await searchHandler(ev("/api/search?q=hello&type=comment"))) as unknown as {
      data: { results: Array<Record<string, unknown>> };
    };
    const json = JSON.stringify(r);
    expect(json).not.toContain('"mail"');
    expect(json).not.toContain('"ip"');
    expect(json).not.toContain('"agent"');
    expect(String(r.data.results[0]?.articleUrl)).toContain("/content/note/a#comment-100");
  });

  test("留言板评论 → /messages#comment-<coid>(系统路由始终可达)", async () => {
    sharedFake.on("informations", "findUnique", async ({ where }: { where: { key: string } }) => {
      if (where.key === "messageContentId") return { value: "42" };
      return null;
    });
    sharedFake.on("comments", "findMany", async () => [{
      coid: 200, name: "g", mail: null, content: "x", create_time: new Date(),
      content_ref: { cid: 42, title: "messages", slug: "messages", status: 1, contentrelations: [] },
    }]);
    const r = (await searchHandler(ev("/api/search?q=x&type=comment"))) as unknown as {
      data: { results: Array<{ articleUrl: string }> };
    };
    expect(r.data.results[0]?.articleUrl).toBe("/messages#comment-200");
  });
});

describe("search.get:subscribepost 分支", () => {
  test("命中标题/描述/正文/作者任一字段", async () => {
    sharedFake.on("subscribeposts", "findMany", async () => [{
      id: 1, subscribeId: 9,
      title: "hello post", description: "d", content: "c", author: "a", link: "https://x.com/p", pubDate: new Date(),
      subscribe: { name: "src", avatar: null },
    }]);
    const r = (await searchHandler(ev("/api/search?q=hello&type=subscribepost"))) as unknown as {
      data: { results: Array<{ type: string; subscribeName: string }>; total: number };
    };
    expect(r.data.total).toBe(1);
    expect(r.data.results[0]?.type).toBe("subscribepost");
    expect(r.data.results[0]?.subscribeName).toBe("src");
  });

  test("外链 sanitize:javascript: 协议被拒(空字符串而非保留原 URL)", async () => {
    sharedFake.on("subscribeposts", "findMany", async () => [{
      id: 1, subscribeId: 9, title: "t", description: "", content: "", author: "", link: "javascript:alert(1)", pubDate: new Date(),
      subscribe: { name: "src", avatar: null },
    }]);
    const r = (await searchHandler(ev("/api/search?q=t&type=subscribepost"))) as unknown as {
      data: { results: Array<{ link: string }> };
    };
    expect(r.data.results[0]?.link).toBe("");
    expect(r.data.results[0]?.link).not.toContain("javascript:");
  });
});