import "#test/helpers/nitro-globals";

import { beforeEach, describe, expect, mock, test } from "bun:test";

import { makeAuthEvent } from "#test/helpers/auth-fakes";
import { mockSharedPrisma, sharedFake } from "#test/helpers/fake-prisma";

mockSharedPrisma();

// ===== ip-location / qqwry:按 IP 给出可控的结构化归属地 =====
// 域名(非 IP 字面量)走 DNS mock,避免真实网络查询
mock.module("node:dns/promises", () => ({
  resolve4: async (domain: string) => (domain === "example-blog.com" ? ["6.6.6.6"] : []),
  resolve6: async () => [],
}));

function fakeResolveCity(ip: string) {
  if (ip === "1.1.1.1" || ip === "6.6.6.6") return { city: "北京", province: null, isDomestic: true, country: "中国" };
  if (ip === "2.2.2.2") return { city: null, province: null, isDomestic: false, country: "亚特兰蒂斯" };
  if (ip === "3.3.3.3") return { city: "上海", province: null, isDomestic: true, country: "中国" };
  if (ip === "9.9.9.9") return { city: null, province: null, isDomestic: false, country: "亚特兰蒂斯" };
  return { city: null, province: "幽州", isDomestic: true, country: "中国" }; // 坐标表外 → unknown
}
mock.module("#server/utils/ip-location", () => ({ resolveCity: async (ip: string) => fakeResolveCity(ip) }));

const ipLocations: Record<string, { location: string; isp: string } | null> = {
  "1.1.1.1": { location: "中国-北京-海淀", isp: "阿里云" },
  "6.6.6.6": { location: "中国-北京-朝阳", isp: "华为云" },
  "2.2.2.2": { location: "亚特兰蒂斯-深海", isp: "Amazon Web Services" },
  "3.3.3.3": { location: "中国-上海-浦东", isp: "腾讯云" },
};
mock.module("#server/utils/qqwry", () => ({ getIpLocation: async (ip: string) => ipLocations[ip] ?? null, queryIpLocation: async () => null }));

// ===== redis 假件:footprint 自定义缓存 =====
const redisStore = new Map<string, string>();
let lastSetex: { key: string; ttl: number } | null = null;
mock.module("#server/utils/redis", () => ({
  redis: {
    get: async (k: string) => redisStore.get(k) ?? null,
    setex: async (k: string, ttl: number, v: string) => {
      redisStore.set(k, v);
      lastSetex = { key: k, ttl };
    },
  },
}));

sharedFake.on("informations", "findUnique", (args: { where: { key: string } }) => {
  if (args.where.key === "commentAvatarService") return { value: "gravatar" };
  if (args.where.key === "sessionStoreType") return { value: "memory" };
  return null;
});

// ===== footprint 的评论行(create_time 倒序:首行最新) =====
const baseRows = () => [
  {
    coid: 101, ip: "1.1.1.1", name: "小明", mail: "M@X.com", link: "https://MX.com", content: "<p>你好呀</p>",
    content_ref: { title: "文章甲", slug: "post-a", status: 1, contentrelations: [{ metas: { slug: "note" } }] },
    create_time: new Date("2026-03-02T00:00:00Z"),
  },
  {
    coid: 102, ip: "2.2.2.2", name: "小明", mail: null, link: null, content: "换IP再来",
    content_ref: { title: "文章乙", slug: "post-b", status: 1, contentrelations: [{ metas: { slug: "note" } }] },
    create_time: new Date("2026-03-01T00:00:00Z"),
  },
  {
    coid: 103, ip: "3.3.3.3", name: "匿名", mail: null, link: null, content: "路过",
    content_ref: null,
    create_time: new Date("2026-02-01T00:00:00Z"),
  },
  {
    coid: 104, ip: "9.9.9.9", name: "海客", mail: "h@x.com", link: null, content: "海外",
    content_ref: null,
    create_time: new Date("2026-01-02T00:00:00Z"),
  },
  {
    coid: 105, ip: "8.8.8.8", name: "迷路人", mail: null, link: null, content: "坐标呢",
    content_ref: null,
    create_time: new Date("2026-01-01T00:00:00Z"),
  },
];
let footprintRows: Array<Record<string, unknown>> = baseRows();
let findManyCalled = false;

// ===== heatmap 数据 =====
let heatmapArticles: Array<{ cid: number; create_time: Date }> = [];
let heatmapComments: Array<{ create_time: Date }> = [];
const seenHeatWhere: Array<Record<string, unknown>> = [];
let commentsQueried = false;
sharedFake.on("contents", "findMany", async (args: { where: Record<string, unknown> }) => {
  seenHeatWhere.push(args.where);
  return heatmapArticles.map(a => ({ ...a }));
});
// comments.findMany 按 where 分流:带 cid 过滤的是 heatmap,其余是 footprint
sharedFake.on("comments", "findMany", async ({ where }: { where?: Record<string, unknown> }) => {
  if (where?.cid) {
    commentsQueried = true;
    return heatmapComments.map(c => ({ ...c }));
  }
  findManyCalled = true;
  return footprintRows.map(r => structuredClone(r));
});

// ===== blog-network 数据源 =====
let bnSubscribes: Array<Record<string, unknown>> = [];
let bnLinks: Array<Record<string, unknown>> = [];
sharedFake.on("subscribes", "findMany", async () => bnSubscribes.map(r => ({ ...r })));
sharedFake.on("links", "findMany", async () => bnLinks.map(r => ({ ...r })));

// ===== 公开 travels =====
let travelRows: Array<Record<string, unknown>> = [];
sharedFake.on("travels", "findMany", async () => travelRows.map(r => structuredClone(r)));

const footprintHandler = (await import("#server/api/footprint.get")).default;
const heatmapHandler = (await import("#server/api/heatmap.get")).default;
const blogNetworkHandler = (await import("#server/api/blog-network.get")).default;
const travelsHandler = (await import("#server/api/travels.get")).default;

function ev(peer: string, url = "/api/x") {
  return makeAuthEvent({ method: "GET", peer, url, headers: { host: "imqi1.com" } }).event;
}
function evh(peer: string, url = "/api/x") {
  return makeAuthEvent({ method: "GET", peer, url, headers: { host: "imqi1.com" } });
}

beforeEach(() => {
  redisStore.clear();
  lastSetex = null;
  footprintRows = baseRows();
  findManyCalled = false;
  heatmapArticles = [];
  heatmapComments = [];
  commentsQueried = false;
  seenHeatWhere.length = 0;
  bnSubscribes = [];
  bnLinks = [];
  travelRows = [];
});

describe("footprint.get(访客分布)", () => {
  test("聚合:身份去重/城市打点/境内外桶/隐私字段不外泄/写缓存", async () => {
    const { event, headers } = evh("10.6.0.1");
    const r = (await footprintHandler(event)) as unknown as {
      success: boolean;
      data: {
        points: Array<{ id: number; name: string; count: number; readers: Array<Record<string, unknown>> }>;
        overseas: number;
        unknown: number;
        total: number;
      };
    };
    expect(r.success).toBe(true);
    // 小明两条评论同身份只算一位,落点北京;匿名落上海;海客→overseas;迷路人→unknown
    expect(r.data.points).toHaveLength(2);
    const bj = r.data.points.find(p => p.name === "北京")!;
    expect(bj.count).toBe(1);
    const reader = bj.readers[0] as Record<string, unknown>;
    expect(reader.name).toBe("小明");
    // 正文去 HTML;文章链接带锚点;头像按邮箱 md5
    expect(reader.comment).toBe("你好呀");
    expect(reader.articleUrl).toBe("/content/note/post-a#comment-101");
    expect(reader.articleTitle).toBe("文章甲");
    expect(String(reader.avatar)).toContain("gravatar.com/avatar");
    // 匿名者无关联文章 → 链接/标题为空
    const sh = r.data.points.find(p => p.name === "上海")!;
    expect(sh.readers[0]!.articleUrl).toBeNull();
    expect(r.data.overseas).toBe(1);
    expect(r.data.unknown).toBe(1);
    expect(r.data.total).toBe(4);
    // 隐私:邮箱与原始 IP 绝不出现
    const raw = JSON.stringify(r);
    expect(raw).not.toContain("M@X.com");
    expect(raw).not.toContain("9.9.9.9");
    expect(raw).not.toContain("1.1.1.1");
    // 自定义缓存写入,TTL 1 小时
    expect(lastSetex).toMatchObject({ key: "custom:footprint", ttl: 3600 });
    expect(headers["cache-control"]).toContain("max-age=300");
  });

  test("缓存命中直接返回,不再查库", async () => {
    const cached = { success: true, data: { points: [{ id: 1, name: "缓存城", count: 9, readers: [] }], overseas: 0, unknown: 0, total: 9 } };
    redisStore.set("custom:footprint", JSON.stringify(cached));
    const r = (await footprintHandler(ev("10.6.0.2"))) as unknown as { data: { points: Array<{ name: string }> } };
    expect(r.data.points[0]!.name).toBe("缓存城");
    expect(findManyCalled).toBe(false);
  });

  test("文章已下架:读者仍在落点,但文章链接/标题隐藏", async () => {
    footprintRows = baseRows().map(r => (r.coid === 101 ? { ...r, content_ref: { ...(r.content_ref as Record<string, unknown>), status: 0 } } : r));
    const r = (await footprintHandler(ev("10.6.0.3"))) as unknown as { data: { points: Array<{ name: string; readers: Array<Record<string, unknown>> }> } };
    const reader = (r.data.points.find(p => p.name === "北京") as { readers: Array<Record<string, unknown>> }).readers[0]!;
    expect(reader.articleUrl).toBeNull();
    expect(reader.articleTitle).toBeNull();
  });
});

describe("heatmap.get", () => {
  test("按天聚合文章与评论,年份倒序", async () => {
    heatmapArticles = [
      { cid: 1, create_time: new Date(2026, 0, 1) },
      { cid: 2, create_time: new Date(2026, 0, 1) },
      { cid: 3, create_time: new Date(2025, 11, 31) },
    ];
    heatmapComments = [
      { create_time: new Date(2026, 0, 1) },
      { create_time: new Date(2025, 11, 31) },
      { create_time: new Date(2025, 11, 31) },
    ];
    const r = (await heatmapHandler(ev("10.6.1.1"))) as unknown as {
      success: boolean;
      data: {
        totalArticles: number;
        totalComments: number;
        years: number[];
        days: Record<string, { articles: number; comments: number }>;
      };
    };
    expect(r.data.totalArticles).toBe(3);
    expect(r.data.totalComments).toBe(3);
    expect(r.data.years).toEqual([2026, 2025]);
    expect(r.data.days["2026-01-01"]).toEqual({ articles: 2, comments: 1 });
    expect(r.data.days["2025-12-31"]).toEqual({ articles: 1, comments: 2 });
  });

  test("category/tag 筛选进 where.AND;无文章时不查评论", async () => {
    heatmapArticles = [];
    await heatmapHandler(ev("10.6.1.2", "/api/heatmap?category=note&tag=hot"));
    const where = seenHeatWhere.at(-1) as unknown as { AND: Array<Record<string, unknown>> };
    expect(where.AND).toHaveLength(2);
    expect(commentsQueried).toBe(false);
  });
});

describe("blog-network.get(博客网络)", () => {
  test("订阅/友链按域名去重(订阅优先),IP 字面量跳过 DNS,境外/无坐标进计数桶", async () => {
    bnSubscribes = [{ id: 1, url: "https://1.1.1.1/", name: "订阅甲", avatar: null }];
    bnLinks = [
      { id: 2, link: "https://2.2.2.2/", name: "友链乙", avatar: "/a.png" },
      { id: 3, link: "1.1.1.1", name: "重复域友链", avatar: null },
      { id: 4, link: "https://3.3.3.3/", name: "友链丙", avatar: null },
      { id: 5, link: "https://8.8.8.8/", name: "无坐标", avatar: null },
    ];
    const { event, headers } = evh("10.6.2.1");
    const r = (await blogNetworkHandler(event)) as unknown as {
      success: boolean;
      data: {
        points: Array<{ name: string; source: string; sourceId: number; targetUrl: string | null; serverLocation: string | null; serverIsp: string | null }>;
        overseas: number;
        unknown: number;
        total: number;
      };
    };
    expect(r.success).toBe(true);
    expect(r.data.total).toBe(4);
    // 两个落点:订阅甲(北京)、友链丙(上海);友链乙境外、无坐标 unknown
    expect(r.data.points).toHaveLength(2);
    const p1 = r.data.points[0]!;
    expect(p1).toMatchObject({ name: "订阅甲", source: "subscribe", sourceId: 1, serverLocation: "北京", serverIsp: "阿里云" });
    expect(p1.targetUrl).toBeNull();
    const p2 = r.data.points[1]!;
    expect(p2).toMatchObject({ name: "友链丙", source: "link", serverLocation: "上海", serverIsp: "腾讯云" });
    expect(p2.targetUrl).toBe("https://3.3.3.3/");
    expect(r.data.overseas).toBe(1);
    expect(r.data.unknown).toBe(1);
    expect(JSON.stringify(r)).not.toContain("2.2.2.2");
    expect(headers["cache-control"]).toContain("max-age=300");
  });

  test("www. 前缀归一化参与去重(域名走 DNS mock)", async () => {
    bnSubscribes = [{ id: 1, url: "https://www.example-blog.com/", name: "主站", avatar: null }];
    bnLinks = [{ id: 2, link: "example-blog.com", name: "裸域", avatar: null }];
    const r = (await blogNetworkHandler(ev("10.6.2.2"))) as unknown as { data: { total: number; points: Array<{ name: string; serverLocation: string | null }> } };
    expect(r.data.total).toBe(1);
    expect(r.data.points[0]!.name).toBe("主站");
    expect(r.data.points[0]!.serverLocation).toBe("北京");
  });
});

describe("travels.get(公开地点)", () => {
  test("展平文章链接与封面计数;无分类文章丢弃;白名单不泄 enabled", async () => {
    travelRows = [
      {
        id: 1, name: "西湖", desc: "景", cover: "/t.jpg", longitude: 120, latitude: 30, sort: 1, enabled: true,
        contenttravels: [
          { content: { cid: 1, title: "甲", slug: "a", covers: JSON.stringify([{ url: "/c1.jpg", width: 10, height: 10 }, { url: "/c2.jpg" }]), many_covers: 1, contentrelations: [{ metas: { slug: "note", type: "category" } }] } },
          { content: { cid: 2, title: "无分类", slug: "b", covers: "[]", many_covers: 0, contentrelations: [] } },
        ],
      },
      {
        id: 2, name: "灵隐", desc: null, cover: null, longitude: 120.1, latitude: 30.2, sort: 2, enabled: true,
        contenttravels: [
          { content: { cid: 3, title: "单封", slug: "c", covers: JSON.stringify([{ url: "/c3.jpg" }]), many_covers: 1, contentrelations: [{ metas: { slug: "note", type: "category" } }] } },
        ],
      },
    ];
    const { event, headers } = evh("10.6.3.1");
    const r = (await travelsHandler(event)) as unknown as {
      code: number;
      data: Array<{ id: number; contents: Array<Record<string, unknown>> }>;
    };
    expect(r.code).toBe(200);
    expect(r.data[0]!.contents).toEqual([{ url: "/content/note/a", title: "甲", coverCount: 2, manyCovers: true }]);
    expect(r.data[1]!.contents[0]!.manyCovers).toBe(false);
    expect(JSON.stringify(r)).not.toContain('"enabled"');
    expect(headers["cache-control"]).toContain("max-age=300");
  });

  test("DB 异常 → 500", async () => {
    sharedFake.on("travels", "findMany", async () => {
      throw new Error("db down");
    });
    await expect(travelsHandler(ev("10.6.3.2"))).rejects.toMatchObject({ statusCode: 500 });
    sharedFake.on("travels", "findMany", async () => travelRows.map(r => structuredClone(r)));
  });
});
