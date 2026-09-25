import { describe, expect, test } from "bun:test";

import { markdownToPlainText, spaceCjkLatin } from "#server/utils/markdownToPlainText";

describe("markdownToPlainText:基础", () => {
  test("空输入返回空串", () => {
    expect(markdownToPlainText("")).toBe("");
    expect(markdownToPlainText(null)).toBe("");
    expect(markdownToPlainText(undefined)).toBe("");
  });

  test("标题/加粗/斜体/删除线去掉标记保留文字", () => {
    const t = markdownToPlainText("# 标题\n\n**粗** *斜* ~~删~~");
    expect(t).toContain("标题");
    expect(t).toContain("粗");
    expect(t).not.toContain("**");
    expect(t).not.toContain("~~");
  });

  test("链接只保留锚文字,URL 不落进纯文本", () => {
    const t = markdownToPlainText("[点我](https://example.com/x)");
    expect(t).toContain("点我");
    expect(t).not.toContain("https://example.com/x");
  });

  test("内联代码与 HTML 实体被还原为纯文本", () => {
    const t = markdownToPlainText("用 `a < b` 比较 &amp; 与 &lt;tag&gt;");
    expect(t).toContain("a < b");
    expect(t).toContain("&");
    expect(t).toContain("<tag>");
  });

  test("列表去标记", () => {
    const t = markdownToPlainText("- 甲\n- 乙\n\n1. 丙");
    expect(t).toContain("甲");
    expect(t).toContain("乙");
    expect(t).toContain("丙");
    expect(t).not.toContain("- 甲");
  });
});

describe("markdownToPlainText:占位符替换", () => {
  test("图片渲染为 <图片：标题> 中文占位", () => {
    expect(markdownToPlainText("![风景](/imgs/a.webp)")).toContain("<图片：风景>");
  });

  test("无标题图片占位不带标题", () => {
    const t = markdownToPlainText("![](/imgs/a.webp)");
    expect(t).toContain("<图片>");
  });

  test("代码块占位含语言与行数", () => {
    const t = markdownToPlainText("```js\nconst a = 1;\nconst b = 2;\n```");
    expect(t).toContain("<代码块");
    expect(t).toContain("js");
    expect(t).toContain("2");
  });

  test("表格占位含行列数", () => {
    const t = markdownToPlainText("| a | b |\n| --- | --- |\n| 1 | 2 |");
    expect(t).toContain("<表格");
  });

  test(":::music 容器转音乐占位", () => {
    const t = markdownToPlainText([":::music netease | song | 186016", ":::"].join("\n"));
    expect(t).toContain("<音乐");
  });

  test(":::live-photo 转实况照片占位", () => {
    const t = markdownToPlainText(":::live-photo /uploads/a.jpg 标题文字\n:::");
    expect(t).toContain("<实况照片");
    expect(t).toContain("标题文字");
  });

  test("未闭合容器回退为普通文本(不吞正文)", () => {
    const t = markdownToPlainText(":::callout info\n正文内容没有闭合");
    expect(t).toContain("正文内容没有闭合");
  });
});

describe("spaceCjkLatin", () => {
  test("中英文之间补空格", () => {
    expect(spaceCjkLatin("中文English混合")).toBe("中文 English 混合");
  });

  test("已有空格不重复补", () => {
    expect(spaceCjkLatin("中文 English")).toBe("中文 English");
  });

  test("纯中文/纯英文不改变", () => {
    expect(spaceCjkLatin("纯中文")).toBe("纯中文");
    expect(spaceCjkLatin("pure english")).toBe("pure english");
  });
});
