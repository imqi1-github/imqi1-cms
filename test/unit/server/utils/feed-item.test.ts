/**
 * feed.ts 单项构建器回归:
 *  - cover width/height 曾裸插值进 XML 属性(covers JSON 站主可写字符串)→ 现强转数字;
 *  - 评论 name/content 是 DOMPurify 白名单后的 HTML,曾原样进 CDATA → 现降纯文本,
 *    防阅读器把 title/description 按 HTML 渲染时的跟踪像素与残余 XSS 面。
 */
import { describe, expect, test } from "bun:test";

const { buildCommentRssItem, buildContentRssItem } = await import("#server/utils/feed");

const BASE = "https://example.com";

describe("buildContentRssItem media:content 属性", () => {
  test("回归:width/height 脏字符串值 → 强转 NaN,整个属性省略,引号注入进不了属性", () => {
    const xml = buildContentRssItem(
      {
        cid: 1,
        title: "t",
        slug: "s",
        desc: null,
        content: "正文",
        create_time: new Date("2026-01-01T00:00:00Z"),
        covers: JSON.stringify([
          { url: "/uploads/a.jpg", desc: "封面", width: '100" onload="x', height: "abc" },
        ]),
        authorNickname: null,
        authorName: "admin",
        categorySlug: "note",
      },
      BASE,
    );
    expect(xml).toContain("<media:content");
    expect(xml).not.toContain("onload");
    expect(xml).not.toContain("width=");
    expect(xml).not.toContain('height="abc"');
  });

  test("width/height 缺失 → 不输出属性;正常数字照常输出", () => {
    const without = buildContentRssItem(
      {
        cid: 1, title: "t", slug: "s", desc: null, content: "正文",
        create_time: new Date("2026-01-01T00:00:00Z"),
        covers: JSON.stringify([{ url: "/uploads/a.jpg" }]),
        authorNickname: null, authorName: "admin", categorySlug: "note",
      },
      BASE,
    );
    expect(without).toContain("<media:content");
    expect(without).not.toContain("width=");
    expect(without).not.toContain("height=");

    const withDims = buildContentRssItem(
      {
        cid: 1, title: "t", slug: "s", desc: null, content: "正文",
        create_time: new Date("2026-01-01T00:00:00Z"),
        covers: JSON.stringify([{ url: "/uploads/a.jpg", width: 100.4, height: 50 }]),
        authorNickname: null, authorName: "admin", categorySlug: "note",
      },
      BASE,
    );
    expect(withDims).toContain('width="100"');
    expect(withDims).toContain('height="50"');
  });
});

describe("buildCommentRssItem 纯文本降级", () => {
  const input = {
    coid: 7,
    cid: 1,
    name: '<b>访客</b><img src="https://evil.com/px.png">',
    content: '<p>好文!<img src="https://evil.com/track.png"><br>收藏了</p>',
    create_time: new Date("2026-01-01T00:00:00Z"),
    contentSlug: "hello",
    contentTitle: "文章",
    categorySlug: "note",
  };

  test("回归:name/content 的标签不进 CDATA(img 跟踪像素被剥掉)", () => {
    const xml = buildCommentRssItem(input, BASE);
    expect(xml).not.toContain("<img");
    expect(xml).not.toContain("<b>");
    expect(xml).not.toContain("evil.com/px.png");
    expect(xml).toContain("收藏了");
  });

  test("昵称降纯文本后进标题;实体解码不二次解码", () => {
    const xml = buildCommentRssItem(input, BASE);
    expect(xml).toContain("访客 留言于《文章》");
    const amp = buildCommentRssItem({ ...input, name: "a&amp;b" }, BASE);
    // &amp; 解一次成 &;不应再解成裸 < 或破坏结构
    expect(amp).toContain("a&b 留言于");
  });
});
