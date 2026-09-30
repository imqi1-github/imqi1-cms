import "#test/helpers/nitro-globals";

import { beforeEach, describe, expect, mock, test } from "bun:test";

import { mockSharedPrisma, sharedFake } from "#test/helpers/fake-prisma";
import { makeAuthEvent } from "#test/helpers/auth-fakes";

mockSharedPrisma();

// mini-fake-data 的开关由 site.config 决定,测试里 mock 成可控值
let fakeDataEnabled = false;
let commentsEnabled = true;
const realMiniFake = await import("#server/utils/mini-fake-data");
mock.module("#server/utils/mini-fake-data", () => ({
  ...realMiniFake,
  isMiniFakeDataEnabled: () => fakeDataEnabled,
  miniCommentsEnabled: () => commentsEnabled,
}));

let linksRows = [
  { id: 1, name: "友链甲", link: "https://a.com", avatar: "/a.png", enabled: true, isModification: false, modificationStatus: null },
  { id: 2, name: "友链乙", link: "www.b.com", avatar: null, enabled: true, isModification: false, modificationStatus: null },
  { id: 3, name: "同域名", link: "https://a.com/other", avatar: null, enabled: true, isModification: false, modificationStatus: null },
];
let subsRows = [
  { id: 10, name: "订阅甲", url: "https://c.com/feed", avatar: "/c.png" },
  { id: 11, name: "同域名订阅", url: "https://a.com/rss", avatar: null },
];

sharedFake.on("links", "findMany", async () => linksRows.map(r => ({ ...r })));
sharedFake.on("subscribes", "findMany", async () => subsRows.map(r => ({ ...r })));

let infoRows = new Map<string, string>();
sharedFake.on("informations", "findUnique", async ({ where }: { where: { key: string } }) =>
  infoRows.has(where.key) ? { value: infoRows.get(where.key)! } : null);
let messagePage: { cid: number } | null = null;
sharedFake.on("contents", "findFirst", async () => messagePage);

const optionsHandler = (await import("#server/api/mini/[...].options")).default;
const messagesConfigHandler = (await import("#server/api/mini/messages-config.get")).default;
const linksHandler = (await import("#server/api/mini/links.get")).default;

beforeEach(() => {
  fakeDataEnabled = false;
  commentsEnabled = true;
  infoRows = new Map();
  messagePage = null;
});

describe("mini/[...].options(CORS 预检)", () => {
  test("放行方法与自定义头,返回 204", () => {
    const headers: Record<string, string> = {};
    const event = {
      node: {
        req: { method: "OPTIONS", url: "/api/mini/links", headers: {} },
        res: {
          statusCode: 200,
          setHeader: (n: string, v: string) => { headers[n.toLowerCase()] = v; },
          getHeader: () => undefined,
          getHeaders: () => headers,
          removeHeader: () => {},
        },
      },
    };
    const r = optionsHandler(event as never);
    expect(r).toBe("");
    expect(event.node.res.statusCode).toBe(204);
    expect(headers["access-control-allow-origin"]).toBe("*");
    expect(headers["access-control-allow-headers"]).toContain("X-Mini-Sign");
    // 自定义平台头在放行列表里(否则小程序无法带 X-Client-Platform)
    expect(headers["access-control-allow-headers"]).toContain("X-Client-Platform");
  });
});

describe("mini/messages-config", () => {
  test("优先用 informations.messageContentId", async () => {
    infoRows.set("messageContentId", "42");
    const r = (await messagesConfigHandler(makeAuthEvent({ method: "GET", peer: "10.9.5.1" }).event)) as { data: { contentId: number; commentEnabled: boolean } };
    expect(r.data.contentId).toBe(42);
    expect(r.data.commentEnabled).toBe(true);
  });

  test("messageContentId 缺失/非法时回退 slug=messages 的页面", async () => {
    messagePage = { cid: 7 };
    const r = (await messagesConfigHandler(makeAuthEvent({ method: "GET", peer: "10.9.5.1" }).event)) as { data: { contentId: number } };
    expect(r.data.contentId).toBe(7);

    infoRows.set("messageContentId", "0");
    const r2 = (await messagesConfigHandler(makeAuthEvent({ method: "GET", peer: "10.9.5.1" }).event)) as { data: { contentId: number } };
    expect(r2.data.contentId).toBe(7);
  });

  test("找不到留言板文章 → contentId 为 null", async () => {
    const r = (await messagesConfigHandler(makeAuthEvent({ method: "GET", peer: "10.9.5.1" }).event)) as { data: { contentId: null } };
    expect(r.data.contentId).toBeNull();
  });

  test("评论开关关闭时 commentEnabled 为 false", async () => {
    commentsEnabled = false;
    const r = (await messagesConfigHandler(makeAuthEvent({ method: "GET", peer: "10.9.5.1" }).event)) as { data: { commentEnabled: boolean } };
    expect(r.data.commentEnabled).toBe(false);
  });

  test("审核模式:不查库,contentId 恒 null", async () => {
    fakeDataEnabled = true;
    infoRows.set("messageContentId", "42");
    const r = (await messagesConfigHandler(makeAuthEvent({ method: "GET", peer: "10.9.5.1" }).event)) as { data: { contentId: null } };
    expect(r.data.contentId).toBeNull();
  });
});

describe("mini/links(域名去重合并)", () => {
  test("按域名去重:友链优先,同域订阅被丢弃;裸主机名补 https 后仍可解析", async () => {
    const r = (await linksHandler(makeAuthEvent({ method: "GET", peer: "10.9.5.2" }).event)) as { data: Array<{ key: string; source: string; url: string }> };
    const keys = r.data.map(d => d.key);
    // a.com 出现三次(两个友链 + 一个订阅)只留首个友链;www.b.com 归一为 b.com
    expect(keys).toEqual(["link-1", "link-2", "subscribe-10"]);
    expect(r.data.find(d => d.key === "link-2")!.url).toBe("www.b.com");
  });

  test("无协议裸主机名不被丢弃", async () => {
    const r = (await linksHandler(makeAuthEvent({ method: "GET", peer: "10.9.5.2" }).event)) as { data: unknown[] };
    expect(r.data).toHaveLength(3);
  });

  test("审核模式:整体置空", async () => {
    fakeDataEnabled = true;
    const r = (await linksHandler(makeAuthEvent({ method: "GET", peer: "10.9.5.2" }).event)) as { data: unknown[] };
    expect(r.data).toEqual([]);
  });

  test("非法 URL 的条目被跳过", async () => {
    linksRows = [
      { id: 1, name: "坏链接", link: "not a url at all", avatar: null, enabled: true, isModification: false, modificationStatus: null },
      { id: 2, name: "好链接", link: "https://ok.com", avatar: null, enabled: true, isModification: false, modificationStatus: null },
    ];
    subsRows = [];
    const r = (await linksHandler(makeAuthEvent({ method: "GET", peer: "10.9.5.2" }).event)) as { data: Array<{ key: string }> };
    expect(r.data.map(d => d.key)).toEqual(["link-2"]);
  });
});
