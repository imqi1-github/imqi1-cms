import { describe, expect, test } from "bun:test";

import { deriveContainerType, splitMarkdown } from "~/utils/markdownSplit";

// md 段的字段名是 text(容器段才是 raw)
describe("splitMarkdown:基础切分", () => {
  test("纯 markdown 无容器 → 单个 md 段", () => {
    expect(splitMarkdown("# 标题\n\n正文")).toEqual([
      { kind: "md", text: "# 标题\n\n正文" },
    ]);
  });

  test("空串返回空数组", () => {
    expect(splitMarkdown("")).toEqual([]);
  });

  test("多行容器独立成段,前后 md 分段保留(段边界含换行)", () => {
    const md = ["前言", "", ":::music netease | song | 1", "歌词", ":::", "", "后记"].join("\n");
    expect(splitMarkdown(md)).toEqual([
      { kind: "md", text: "前言\n" },
      { kind: "container", raw: ":::music netease | song | 1\n歌词\n:::" },
      { kind: "md", text: "\n后记" },
    ]);
  });

  test("单行容器(行内两个 :::)整行为一段", () => {
    const segs = splitMarkdown("正文\n:::music a | b | c :::\n后文");
    expect(segs.some(s => s.kind === "container" && s.raw.includes(":::music"))).toBe(true);
  });
});

describe("splitMarkdown:嵌套与围栏", () => {
  test("嵌套容器:外层吞掉内层全文", () => {
    const md = [":::details", ":::callout", "内文", ":::", ":::"].join("\n");
    const containers = splitMarkdown(md).filter(s => s.kind === "container");
    expect(containers).toHaveLength(1);
    expect(containers[0]!.raw).toContain(":::callout");
    expect(containers[0]!.raw).toContain("内文");
  });

  test("围栏代码块内的 ::: 是字面量,不切分", () => {
    const md = ["```md", ":::music a | b :::", "```"].join("\n");
    expect(splitMarkdown(md).every(s => s.kind === "md")).toBe(true);
  });

  test("未闭合容器回退为普通 md(不吞正文)", () => {
    const segs = splitMarkdown([":::details", "正文内容没闭合"].join("\n"));
    expect(segs.every(s => s.kind === "md")).toBe(true);
    expect(segs.map(s => ("text" in s ? s.text : s.raw)).join("")).toContain("正文内容没闭合");
  });
});

describe("deriveContainerType", () => {
  test("提取 :::type 的 type", () => {
    expect(deriveContainerType(":::music netease | song")).toBe("music");
    expect(deriveContainerType(":::live-photo /a.jpg")).toBe("live-photo");
  });

  test("非容器开头 → null", () => {
    expect(deriveContainerType("普通文本")).toBeNull();
  });
});
