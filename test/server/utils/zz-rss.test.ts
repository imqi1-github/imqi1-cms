// 真实 rss.ts 测试:fetchPublicUrl 以 mock.module 替换——故文件名 zz-rss:
// 必须排在 safe-fetch.test(z<s,防毒化它)与 rss-scheduler.test(utils<plugins,防被它的 rss mock 污染)之间。
import "#test/helpers/nitro-globals";

import { PrismaClientKnownRequestError } from "@prisma/client/runtime/client";
import { beforeEach, describe, expect, mock, test } from "bun:test";

import { mockSharedPrisma, sharedFake } from "#test/helpers/fake-prisma";

mockSharedPrisma();

// ===== fetchPublicUrl 替身:按 url 返回受控 XML =====
const feedXml: Record<string, string> = {};
mock.module("#server/utils/safe-fetch", () => ({
  fetchPublicUrl: async (url: string, cb: (res: { ok: boolean; status: number; text: () => Promise<string> }) => Promise<unknown>) =>
    cb({ ok: true, status: 200, text: async () => feedXml[url] ?? "" }),
}));

// ===== prisma 假件 =====
const upserts: Array<{ link: string; title: string; subscribeId: number }> = [];
let upsertError: unknown = null;
const subscribeUpdates: number[] = [];
let subscribeRows: Array<{ id: number; name: string; url: string; avatar: string | null; lastUpdated?: Date }> = [];
let subscribePostRows: Array<Record<string, unknown>> = [];



const { updateAllSubscribes, getSubscribePosts, getSubscriptionStats, getSourceStatus, sanitizeExternalUrl } =
  await import("#server/utils/rss");

const rssXml = (items: string) => `<?xml version="1.0"?><rss version="2.0"><channel><title>源</title>${items}</channel></rss>`;
const itemXml = (over: { title: string; link: string; extra?: string }) =>
  `<item><title>${over.title}</title><link>${over.link}</link>${over.extra ?? ""}</item>`;

function registerFakes(): void {
  subscribeRows = [];
  subscribePostRows = [];
  sharedFake.on("subscribes", "findMany", async (args?: { include?: unknown }) => {
    if (args?.include) {
      return [{ id: 1, name: "订阅甲", avatar: "/a.png", lastUpdated: new Date(), subscribeposts: subscribePostRows.map(r => ({ ...r })) }];
    }
    return subscribeRows.map(r => ({ ...r }));
  });
  sharedFake.on("subscribes", "update", async ({ where }: { where: { id: number } }) => {
    subscribeUpdates.push(where.id);
    return {};
  });
  sharedFake.on("subscribeposts", "upsert", async ({ where, create }: { where: { link: string }; create: Record<string, unknown> }) => {
    if (upsertError) throw upsertError;
    upserts.push({ link: where.link, title: String(create.title), subscribeId: Number(create.subscribeId) });
    return create;
  });
}
registerFakes();

beforeEach(() => {
  upserts.length = 0;
  upsertError = null;
  subscribeUpdates.length = 0;
  registerFakes();
  for (const k of Object.keys(feedXml)) Reflect.deleteProperty(feedXml, k);
});

describe("updateAllSubscribes(RSS 解析与入库)", () => {
  test("RSS 频道:items 入库、截 10 篇、更新 lastUpdated、状态与统计可见", async () => {
    const items = Array.from({ length: 12 }, (_, i) =>
      itemXml({ title: `文${i}`, link: `https://a.com/${i}`, extra: `<pubDate>Thu, 0${(i % 9) + 1} Jul 2026 00:00:00 GMT</pubDate>` })).join("");
    feedXml["https://feed-a.com/rss"] = rssXml(items);
    subscribeRows = [{ id: 1, name: "源甲", url: "https://feed-a.com/rss", avatar: null }];

    const r = await updateAllSubscribes();
    expect(r.success).toBe(1);
    expect(r.total).toBe(1);
    expect(r.details[0]).toMatchObject({ name: "源甲", success: true, message: "获取 10 篇文章" });
    expect(upserts).toHaveLength(10); // 每源最多 10 篇
    expect(subscribeUpdates).toEqual([1]);
    const status = getSourceStatus(1)!;
    expect(status.success).toBe(true);
    expect(status.articleCount).toBe(10);
    expect(typeof status.latestTitle).toBe("string");
    expect(getSubscriptionStats().updateCount).toBeGreaterThanOrEqual(1);
    expect(getSubscriptionStats().successCount).toBe(1);
  });

  test("atom:link 兜底、content:encoded、dc:creator、非法 pubDate 丢弃", async () => {
    feedXml["https://feed-b.com/rss"] = rssXml(
      `<item><title>甲</title><atom:link href="https://b.com/1" rel="alternate"/><content:encoded><![CDATA[<p>正文</p>]]></content:encoded><dc:creator>作者甲</dc:creator><pubDate>not-a-date</pubDate></item>`,
    );
    subscribeRows = [{ id: 2, name: "源乙", url: "https://feed-b.com/rss", avatar: null }];
    await updateAllSubscribes();
    expect(upserts).toHaveLength(1);
    expect(upserts[0]).toMatchObject({ link: "https://b.com/1", title: "甲", subscribeId: 2 });
  });

  test("Atom 格式:entry/link 数组/author 数组/published", async () => {
    feedXml["https://feed-c.com/atom"] = `<?xml version="1.0"?><feed xmlns="http://www.w3.org/2005/Atom">
      <entry><title>原子甲</title>
        <link href="https://c.com/1"/><link href="https://c.com/alt"/>
        <author><name>作甲</name></author><published>2026-07-01T00:00:00Z</published>
        <summary>摘要</summary><content>正文</content></entry>
      <entry><title>原子乙</title><link href="https://c.com/2"/><author><name>作乙</name></author></entry>
    </feed>`;
    subscribeRows = [{ id: 3, name: "源丙", url: "https://feed-c.com/atom", avatar: null }];
    const r = await updateAllSubscribes();
    expect(r.success).toBe(1);
    expect(upserts.map(u => u.title)).toEqual(["原子甲", "原子乙"]);
    expect(upserts[0]!.link).toBe("https://c.com/1");
  });

  test("非 http(s) 链接写入前被丢弃(存储型 XSS 纵深)", async () => {
    feedXml["https://feed-d.com/rss"] = rssXml(
      itemXml({ title: "恶", link: "javascript:alert(1)" }) + itemXml({ title: "好", link: "https://d.com/ok" }),
    );
    subscribeRows = [{ id: 4, name: "源丁", url: "https://feed-d.com/rss", avatar: null }];
    await updateAllSubscribes();
    expect(upserts.map(u => u.link)).toEqual(["https://d.com/ok"]);
  });

  test("upsert P2002 重复链接跳过;其它错误进失败明细", async () => {
    feedXml["https://feed-e.com/rss"] = rssXml(itemXml({ title: "重复", link: "https://e.com/1" }));
    subscribeRows = [{ id: 5, name: "源戊", url: "https://feed-e.com/rss", avatar: null }];
    upsertError = new PrismaClientKnownRequestError("dup", { code: "P2002", clientVersion: "test" });
    expect((await updateAllSubscribes()).success).toBe(1);

    upsertError = new Error("db down");
    const r2 = await updateAllSubscribes();
    expect(r2.success).toBe(0);
    expect(getSourceStatus(5)).toMatchObject({ success: false });
  });

  test("无条目/上游失败 → success:false 带错误信息", async () => {
    feedXml["https://feed-f.com/rss"] = rssXml("");
    subscribeRows = [{ id: 6, name: "源己", url: "https://feed-f.com/rss", avatar: null }];
    const r = await updateAllSubscribes();
    expect(r.success).toBe(0);
    expect(r.details[0]!.message).toContain("未解析到任何文章");
  });

  test("多源并发:全部处理且计数正确", async () => {
    for (let i = 1; i <= 6; i++) {
      feedXml[`https://f${i}.com/rss`] = rssXml(itemXml({ title: `文${i}`, link: `https://f${i}.com/1` }));
      subscribeRows.push({ id: 100 + i, name: `源${i}`, url: `https://f${i}.com/rss`, avatar: null });
    }
    const r = await updateAllSubscribes();
    expect(r.total).toBe(6);
    expect(r.success).toBe(6);
    expect(r.failed).toBe(0);
    expect(r.details).toHaveLength(6);
    expect(upserts).toHaveLength(6);
  });
});

describe("getSubscribePosts(读取侧)", () => {
  test("sanitize 外链、按 pubDate 降序、null 日期垫底", async () => {
    subscribePostRows = [
      { id: 1, title: "旧", link: "https://a.com/1", description: null, pubDate: new Date("2026-01-01T00:00:00Z") },
      { id: 2, title: "新", link: "javascript:alert(1)", description: "d", pubDate: new Date("2026-03-01T00:00:00Z") },
      { id: 3, title: "无日期", link: "https://a.com/3", description: null, pubDate: null },
    ];
    const r = await getSubscribePosts();
    expect(r).toHaveLength(3);
    // javascript: 链接被 sanitize 置空(不剔除行,由消费方按空链接处理)
    expect(r.find(x => x.title === "新")!.link).toBe("");
    // 按 pubDate 降序,null 日期垫底
    expect(r.map(x => x.title)).toEqual(["新", "旧", "无日期"]);
    expect(r[0]!.subscribeName).toBe("订阅甲");
  });
});

describe("sanitizeExternalUrl", () => {
  test("仅放行 http/https;杂凑全拒", () => {
    expect(sanitizeExternalUrl("https://a.com/x")).toBe("https://a.com/x");
    expect(sanitizeExternalUrl("http://a.com")).toBe("http://a.com");
    expect(sanitizeExternalUrl("javascript:alert(1)")).toBe("");
    expect(sanitizeExternalUrl("data:text/html,x")).toBe("");
    expect(sanitizeExternalUrl("not a url")).toBe("");
    expect(sanitizeExternalUrl("")).toBe("");
    expect(sanitizeExternalUrl(null)).toBe("");
  });
});
