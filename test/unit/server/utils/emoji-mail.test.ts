import { describe, expect, test } from "bun:test";

// cwd 为项目根时 dev 路径 app/assets/emojis.json 存在,可真实加载
const { MailEmojiRenderer } = await import("#server/utils/emoji-mail");

describe("MailEmojiRenderer(真实 emojis.json)", () => {
  test("无占位符的文本原样通过且 HTML 转义", () => {
    const r = new MailEmojiRenderer();
    const html = r.renderContent("纯文本 <b>加粗</b> & 引号'");
    expect(html).not.toContain("<b>");
    expect(html).toContain("&lt;b&gt;");
    expect(html).not.toContain("cid:");
  });

  test("表情占位符替换为 cid 引用的 img", () => {
    const r = new MailEmojiRenderer();
    const html = r.renderContent("看这个 :[heo-3d眼镜] 好看");
    expect(html).toContain('src="cid:');
    expect(html).toContain(String.fromCharCode(97,108,116,61,34) + "3d眼镜" + String.fromCharCode(34));
    expect(html).toContain("style=\"display:inline-block");
  });

  test("同一实例共享 cid 编号与附件表;未知占位符原样保留", () => {
    const r = new MailEmojiRenderer();
    const html1 = r.renderContent(":[heo-3d眼镜]");
    const html2 = r.renderContent(":[heo-3d眼镜]");
    const cid1 = /cid:([^"]+)/.exec(html1)?.[1];
    const cid2 = /cid:([^"]+)/.exec(html2)?.[1];
    expect(cid1).toBe(cid2);
    expect(r.getAttachments()).toHaveLength(1);
    expect(r.renderContent(":[不存在的表情]")).toContain(":[不存在的表情]");
  });
});
