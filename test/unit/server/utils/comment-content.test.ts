/**
 * server/utils/comment-content.ts 入库净化补测：
 *  - 落库的是纯文本：HTML 标签被剥离，实体被解回字面字符（避免存储层+渲染层双重转义）
 *  - 换行原样保留（多行评论的核心诉求）
 *  - 表情占位符 :[key] 不受影响
 *  - 不再因 SAFE_FOR_TEMPLATES 丢掉 {{ ... }} 内容
 */
import { describe, expect, test } from "bun:test";

import { sanitizeCommentContent } from "#server/utils/comment-content";
import { escapeHtmlWithLinks } from "#shared/html";

// 用 chr(N) 拼特殊字符,避免源码里的 < > " 被工具链二次解释
function chr(n: number): string {
  return String.fromCharCode(n);
}

describe("sanitizeCommentContent", () => {
  test("换行原样保留", () => {
    expect(sanitizeCommentContent("第一行\n第二行\n\n第四行")).toBe("第一行\n第二行\n\n第四行");
  });

  test("HTML 标签被剥离,文本内容保留", () => {
    expect(sanitizeCommentContent(`${chr(60)}b${chr(62)}粗${chr(60)}/b${chr(62)}`)).toBe("粗");
  });

  test("script 连内容一起删除", () => {
    expect(sanitizeCommentContent(`${chr(60)}script${chr(62)}alert(1)${chr(60)}/script${chr(62)}正文`)).toBe("正文");
  });

  test("img 标签整体删除(不留原始标签入库)", () => {
    const out = sanitizeCommentContent(`${chr(60)}img src=x onerror=alert(1)${chr(62)}`);
    expect(out).toBe("");
    expect(out).not.toContain("img");
  });

  test("& 与 < 还原为字面字符(不存实体,渲染端转义一次即所见即所得)", () => {
    const AMP = chr(38);
    expect(sanitizeCommentContent(`A ${AMP} B`)).toBe(`A ${AMP} B`);
    expect(sanitizeCommentContent(`5 ${chr(60)} 6`)).toBe(`5 ${chr(60)} 6`);
    expect(sanitizeCommentContent(`5 ${chr(60)} 6`)).not.toContain(`${AMP}lt;`);
  });

  test("用户输入的字面实体只解一次,不二次解码", () => {
    const AMP = chr(38);
    expect(sanitizeCommentContent(`${AMP}amp;lt;`)).toBe(`${AMP}lt;`);
  });

  test("表情占位符原样保留", () => {
    expect(sanitizeCommentContent("看这个 :[heo-3d眼镜] 好看")).toBe("看这个 :[heo-3d眼镜] 好看");
  });

  test("模板占位内容不被删除(不再用 SAFE_FOR_TEMPLATES)", () => {
    expect(sanitizeCommentContent("Vue 的 {{ message }} 插值")).toBe("Vue 的 {{ message }} 插值");
  });

  test("空串与空输入返回空串", () => {
    expect(sanitizeCommentContent("")).toBe("");
  });

  test("往返不变式:入库净化 → 渲染转义一次 = 用户原文(不双重转义)", () => {
    const raw = `A ${chr(38)} B\n5 ${chr(60)} 6`;
    const stored = sanitizeCommentContent(raw);
    // 库里存的就是用户原文（无实体）
    expect(stored).toBe(raw);
    // 渲染端只转义一次 → 浏览器解回原文，不会出现 &amp;amp; / &amp;lt; 字面量
    const rendered = escapeHtmlWithLinks(stored);
    expect(rendered).not.toContain("&amp;amp;");
    expect(rendered).not.toContain("&amp;lt;");
    expect(rendered).toContain(`A ${chr(38)}amp; B`);
  });
});
