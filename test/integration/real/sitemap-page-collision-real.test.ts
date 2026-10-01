/**
 * 真实 DB 集成测 —— sitemap 边角:DB page slug 与硬编码路由重复时去重
 *
 * HARDCODED 数组 ["messages","agreement","about","map","search","links",
 *   "changelogs","subscribes","feed","archiving"] 共 10 个,DB 里 page slug
 *   命中其中之一时,sitemap 必须 filter 掉避免 <loc> 重复生成。
 *
 * 验证:
 * - DB page.slug = "messages" → sitemap 中只有一个 /messages <loc>
 * - DB page.slug = "新页面" → 正常生成 /新页面 <loc>
 * - DB page.slug = "" / null → 跳过(空 slug 保护)
 */
import { describe, expect, test } from "bun:test";

import { setupTestEnv } from "./_setup";

import { TEST_SITE_URL } from "#shared/constants";

await setupTestEnv();
await import("#test/helpers/nitro-globals");
const { getDb, resetDb } = await import("./_helpers");

const sitemapHandler = (await import("#server/routes/sitemap.xml.get")).default;

function event() {
  return {
    method: "GET",
    context: {},
    path: "/sitemap.xml",
    node: {
      req: { method: "GET", url: "/sitemap.xml", headers: {} },
      res: { setHeader() {}, getHeader: () => undefined, getHeaders: () => ({}) },
    },
  } as never;
}

async function getXml(): Promise<string> {
  return (await sitemapHandler(event())) as unknown as string;
}

function countOccurrences(xml: string, path: string): number {
  // 用 <loc>...</loc> 包裹防误命中(避免路径子串误判)
  const needle = `<loc>${TEST_SITE_URL}${path}</loc>`;
  return (xml.match(new RegExp(needle.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"), "g")) ?? []).length;
}

describe("sitemap DB page slug 与硬编码路由去重(真实 DB)", () => {
  test("DB page.slug = 'messages' → sitemap 只一个 /messages <loc>(不被双写)", async () => {
    await resetDb();
    const db = await getDb();
    // 创建 type=1 (页面) + slug 与硬编码冲突
    await db.contents.create({
      data: {
        title: "我的留言页", slug: "messages", content: "page content",
        status: 1, type: 1, comment_num: 0, uid: 1,
        update_time: new Date(), create_time: new Date(),
      },
    });
    const xml = await getXml();
    expect(countOccurrences(xml, "/messages")).toBe(1);
  });

  test("DB page.slug = 'agreement' → sitemap 只一个 /agreement <loc>", async () => {
    await resetDb();
    const db = await getDb();
    await db.contents.create({
      data: {
        title: "我的协议页", slug: "agreement", content: "x",
        status: 1, type: 1, comment_num: 0, uid: 1,
        update_time: new Date(), create_time: new Date(),
      },
    });
    const xml = await getXml();
    expect(countOccurrences(xml, "/agreement")).toBe(1);
  });

  test("DB page.slug = 'about' → sitemap 只一个 /about <loc>", async () => {
    await resetDb();
    const db = await getDb();
    await db.contents.create({
      data: {
        title: "关于", slug: "about", content: "x",
        status: 1, type: 1, comment_num: 0, uid: 1,
        update_time: new Date(), create_time: new Date(),
      },
    });
    const xml = await getXml();
    expect(countOccurrences(xml, "/about")).toBe(1);
  });

  test("DB page.slug = '新页面' → sitemap 正常生成 /新页面 <loc>(不撞硬编码)", async () => {
    await resetDb();
    const db = await getDb();
    await db.contents.create({
      data: {
        title: "独立页面", slug: "新页面", content: "x",
        status: 1, type: 1, comment_num: 0, uid: 1,
        update_time: new Date(), create_time: new Date(),
      },
    });
    const xml = await getXml();
    expect(countOccurrences(xml, "/新页面")).toBe(1);
  });

  test("DB page.slug = '' → 跳过(空 slug 保护,不生成空 <loc>)", async () => {
    await resetDb();
    const db = await getDb();
    await db.contents.create({
      data: {
        title: "无 slug 页", slug: "", content: "x",
        status: 1, type: 1, comment_num: 0, uid: 1,
        update_time: new Date(), create_time: new Date(),
      },
    });
    const xml = await getXml();
    // 首页(<loc>${TEST_SITE_URL}/</loc>)是静态页产物,与空 slug page 无关;
    // 验证空 slug page 不产生空路径 <loc>(slug 为空会被 filter 掉)
    // 实现是 page.slug && !HARDCODED.includes → 空字符串 falsy → 跳过
    // 没有"空 path 的 page URL" 出现:数 <loc>${TEST_SITE_URL}</loc> 后跟 <\/loc> 应是首页
    expect(xml).toContain(`<loc>${TEST_SITE_URL}/</loc>`); // 首页(静态)
    // 空 slug 不应产生额外空路径
    expect(countOccurrences(xml, "/")).toBe(1); // 只首页一处根路径
  });

  test("草稿页面(status=0)不出现(只在 type=1 + status=1 中)", async () => {
    await resetDb();
    const db = await getDb();
    await db.contents.create({
      data: {
        title: "草稿页", slug: "draft-page", content: "x",
        status: 0, type: 1, comment_num: 0, uid: 1,
        update_time: new Date(), create_time: new Date(),
      },
    });
    const xml = await getXml();
    expect(xml).not.toContain("/draft-page");
  });

  test("硬编码路由全在(基线)+ DB page 一律去重", async () => {
    await resetDb();
    const db = await getDb();
    // 同时插入 3 个冲突 + 2 个独立
    await db.contents.createMany({
      data: [
        { title: "A1", slug: "messages", content: "x", status: 1, type: 1, comment_num: 0, uid: 1, update_time: new Date(), create_time: new Date() },
        { title: "A2", slug: "links", content: "x", status: 1, type: 1, comment_num: 0, uid: 1, update_time: new Date(), create_time: new Date() },
        { title: "A3", slug: "feed", content: "x", status: 1, type: 1, comment_num: 0, uid: 1, update_time: new Date(), create_time: new Date() },
        { title: "B1", slug: "about-me", content: "x", status: 1, type: 1, comment_num: 0, uid: 1, update_time: new Date(), create_time: new Date() },
        { title: "B2", slug: "projects", content: "x", status: 1, type: 1, comment_num: 0, uid: 1, update_time: new Date(), create_time: new Date() },
      ],
    });
    const xml = await getXml();
    expect(countOccurrences(xml, "/messages")).toBe(1);
    expect(countOccurrences(xml, "/links")).toBe(1);
    expect(countOccurrences(xml, "/feed")).toBe(1);
    expect(countOccurrences(xml, "/about-me")).toBe(1);
    expect(countOccurrences(xml, "/projects")).toBe(1);
  });
});