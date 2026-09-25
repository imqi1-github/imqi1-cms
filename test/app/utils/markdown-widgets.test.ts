import { describe, expect, test } from "bun:test";

import { escapeHtmlAttr, parseImageLine, safeDecodeURIComponent } from "~/utils/markdownWidgets";

describe("escapeHtmlAttr", () => {
  test("转义全部 5 个 HTML 特殊字符", () => {
    expect(escapeHtmlAttr('a & b "c" <d> \'e\'')).toBe(
      "a &amp; b &quot;c&quot; &lt;d&gt; &#39;e&#39;",
    );
  });

  test("普通文本原样", () => {
    expect(escapeHtmlAttr("hello 世界")).toBe("hello 世界");
  });
});

describe("safeDecodeURIComponent", () => {
  test("合法编码解码", () => {
    expect(safeDecodeURIComponent("%E4%B8%AD")).toBe("中");
    expect(safeDecodeURIComponent("plain")).toBe("plain");
  });

  test("非法 % 编码回退原串不抛", () => {
    expect(safeDecodeURIComponent("%zz")).toBe("%zz");
    expect(safeDecodeURIComponent("100%")).toBe("100%");
  });
});

describe("parseImageLine", () => {
  test("竖线分隔:src + caption(多个竖线归入 caption)", () => {
    expect(parseImageLine("/a.jpg | 标题 | 备注")).toEqual({ src: "/a.jpg", caption: "标题 | 备注" });
  });

  test("无竖线:空白分隔,首个 token 是 src", () => {
    expect(parseImageLine("/a.jpg 一些说明文字")).toEqual({ src: "/a.jpg", caption: "一些说明文字" });
  });

  test("仅路径无说明", () => {
    expect(parseImageLine("/a.jpg")).toEqual({ src: "/a.jpg", caption: "" });
  });

  test("竖线前后空白被 trim", () => {
    expect(parseImageLine("/a.jpg |   标题  ")).toEqual({ src: "/a.jpg", caption: "标题" });
  });
});
