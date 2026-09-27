/**
 * server/utils/emoji-mail.ts MailEmojiRenderer 补测:
 *  - escapeHtml 邮件正文防 XSS(不依赖 DOMPurify)
 *  - 同一表情跨多段内容 → 共享 cid(去重)
 *  - 未命中 emoji → 保留原 :[key] 占位符
 *  - null/空串 → 空字符串
 *  - getAttachments 顺序与渲染顺序一致
 *  - 多次独立实例互不影响
 *  - cid 编号从 0 递增
 */
import { describe, expect, test } from "bun:test";

import { MailEmojiRenderer } from "#server/utils/emoji-mail";

describe("MailEmojiRenderer 基础行为", () => {
  test("null/undefined/空串 → 空字符串", () => {
    const r = new MailEmojiRenderer();
    expect(r.renderContent(null)).toBe("");
    expect(r.renderContent(undefined)).toBe("");
    expect(r.renderContent("")).toBe("");
  });

  test("不含 :[ 占位符的文本 → escapeHtml 后透传", () => {
    const r = new MailEmojiRenderer();
    const html = r.renderContent("hello <world>");
    expect(html).toContain("&lt;world&gt;");
    expect(html).not.toContain("<world>");
  });

  test("未命中 emoji 的 :[key] → 保留原占位符", () => {
    const r = new MailEmojiRenderer();
    const html = r.renderContent("hello :[unknown-emoji] world");
    expect(html).toContain(":[unknown-emoji]");
  });
});

describe("MailEmojiRenderer 表情命中", () => {
  // 用真实存在于 emojis.json 的 key
  const EMOJI_A = "heo-3d眼镜";
  const EMOJI_B = "heo-亲亲";

  test("命中 → 生成 cid img + 附件", () => {
    const r = new MailEmojiRenderer();
    const html = r.renderContent(`hi :[${EMOJI_A}] 你好`);
    expect(html).toContain('src="cid:emoji-0@imqi1"');
    expect(html).toContain("alt=");
    expect(html).toContain("style=");
    const attachments = r.getAttachments();
    expect(attachments).toHaveLength(1);
    expect(attachments[0]!.cid).toBe("emoji-0@imqi1");
    expect(attachments[0]!.filename).toBe("emoji-0.png");
    expect(attachments[0]!.contentType).toBe("image/png");
  });

  test("同一表情在多段内容中 → 共享 cid(只附一份)", () => {
    const r = new MailEmojiRenderer();
    r.renderContent(`first :[${EMOJI_A}] a`);
    r.renderContent(`second :[${EMOJI_A}] b`);
    const html = r.renderContent(`third :[${EMOJI_A}] c`);
    expect(html).toContain("src=\"cid:emoji-0@imqi1\"");
    // 三段都替换,但只有 1 份附件
    expect(r.getAttachments()).toHaveLength(1);
  });

  test("不同表情 → 各自独立 cid 编号递增", () => {
    const r = new MailEmojiRenderer();
    const html1 = r.renderContent(`a :[${EMOJI_A}]`);
    const html2 = r.renderContent(`b :[${EMOJI_B}]`);
    expect(html1).toContain("cid:emoji-0@imqi1");
    expect(html2).toContain("cid:emoji-1@imqi1");
    expect(r.getAttachments()).toHaveLength(2);
  });

  test("emoji cid 编号从 0 递增", () => {
    const r = new MailEmojiRenderer();
    const html1 = r.renderContent(`:[${EMOJI_A}]`);
    const html2 = r.renderContent(`:[${EMOJI_B}]`);
    const html3 = r.renderContent(":[猫猫虫-87]");
    expect(html1).toContain("emoji-0@imqi1");
    expect(html2).toContain("emoji-1@imqi1");
    expect(html3).toContain("emoji-2@imqi1");
  });
});

describe("MailEmojiRenderer 多实例隔离", () => {
  test("不同实例的 cid 编号互不影响(各自从 0 开始)", () => {
    const r1 = new MailEmojiRenderer();
    const r2 = new MailEmojiRenderer();
    const html1 = r1.renderContent(":[heo-3d眼镜]");
    const html2 = r2.renderContent(":[heo-亲亲]");
    expect(html1).toContain("emoji-0@imqi1");
    expect(html2).toContain("emoji-0@imqi1"); // r2 独立从 0 开始
  });

  test("不同实例的附件表互不影响(各自独立从 0 开始)", () => {
    const r1 = new MailEmojiRenderer();
    const r2 = new MailEmojiRenderer();
    r1.renderContent(":[heo-3d眼镜]");
    r2.renderContent(":[heo-亲亲]");
    expect(r1.getAttachments()).toHaveLength(1);
    expect(r2.getAttachments()).toHaveLength(1);
    // 各自实例的 cid 都从 0 开始;附件是不同实例下的两个独立 MailEmojiAttachment 对象
    expect(r1.getAttachments()[0]).not.toBe(r2.getAttachments()[0]);
  });
});

describe("MailEmojiRenderer XSS 防注入", () => {
  test("emoji name 命中 → 含 alt attr", () => {
    const r = new MailEmojiRenderer();
    const html = r.renderContent(":[heo-3d眼镜]");
    expect(html).toContain("alt=");
  });

  test("正文 <script> → escapeHtml 后被剥离", () => {
    const r = new MailEmojiRenderer();
    const html = r.renderContent("<script>alert(1)</script>");
    expect(html).not.toContain("<script>");
    expect(html).toContain("&lt;script&gt;");
  });

  test("正文含引号 → escapeHtml 后被转义", () => {
    const r = new MailEmojiRenderer();
    const html = r.renderContent('" onclick="alert(1)');
    expect(html).not.toContain('" onclick="alert(1)');
    expect(html).toContain("&quot;");
  });
});

describe("MailEmojiRenderer.getAttachments", () => {
  test("无表情时返回空数组", () => {
    const r = new MailEmojiRenderer();
    expect(r.getAttachments()).toEqual([]);
  });

  test("附件按渲染顺序添加", () => {
    const r = new MailEmojiRenderer();
    r.renderContent(":[heo-3d眼镜] :[heo-亲亲] :[heo-3d眼镜]");
    const attachments = r.getAttachments();
    expect(attachments).toHaveLength(2);
    expect(attachments[0]!.cid).toBe("emoji-0@imqi1"); // 3d眼镜 先
    expect(attachments[1]!.cid).toBe("emoji-1@imqi1"); // 亲亲 后
  });
});