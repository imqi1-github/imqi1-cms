import { describe, expect, test } from "bun:test";

import {
  normalizeChangelogEntries,
  parseChangelogContent,
  renderChangelogContent,
  renderChangelogEntries,
  stringifyChangelogContent,
} from "#server/utils/changelog";

describe("parseChangelogContent", () => {
  test("合法 JSON 数组 → 规整为 { type, value } 数组", () => {
    const raw = JSON.stringify([
      { type: "功能", value: "新功能" },
      { type: "修复", value: "bug 修复" },
    ]);
    expect(parseChangelogContent(raw)).toEqual([
      { type: "功能", value: "新功能" },
      { type: "修复", value: "bug 修复" },
    ]);
  });

  test("非法 type → 回退「其他」", () => {
    const raw = JSON.stringify([{ type: "未知类型", value: "x" }]);
    expect(parseChangelogContent(raw)).toEqual([{ type: "其他", value: "x" }]);
  });

  test("value 非字符串 → 转字符串", () => {
    const raw = JSON.stringify([{ type: "功能", value: 123 }]);
    expect(parseChangelogContent(raw)).toEqual([{ type: "功能", value: "123" }]);
    const rawNull = JSON.stringify([{ type: "功能", value: null }]);
    expect(parseChangelogContent(rawNull)).toEqual([{ type: "功能", value: "" }]);
  });

  test("非法 JSON → 当作单条「其他」回退(容错旧 desc 字段)", () => {
    expect(parseChangelogContent("plain text not json")).toEqual([
      { type: "其他", value: "plain text not json" },
    ]);
  });

  test("空字符串 / null / undefined → 空数组", () => {
    expect(parseChangelogContent("")).toEqual([]);
    expect(parseChangelogContent("   ")).toEqual([]);
    expect(parseChangelogContent(null)).toEqual([]);
    expect(parseChangelogContent(undefined)).toEqual([]);
  });

  test("JSON 解析成功但不是数组(对象/字符串) → 当作单条「其他」", () => {
    expect(parseChangelogContent('{"foo":"bar"}')).toEqual([
      { type: "其他", value: '{"foo":"bar"}' },
    ]);
    expect(parseChangelogContent('"just a string"')).toEqual([
      { type: "其他", value: "just a string" },
    ]);
  });

  test("数组含非对象条目 → 过滤掉", () => {
    const raw = JSON.stringify([
      { type: "功能", value: "valid" },
      "string item",
      null,
      { type: "修复", value: "also valid" },
    ]);
    expect(parseChangelogContent(raw)).toEqual([
      { type: "功能", value: "valid" },
      { type: "修复", value: "also valid" },
    ]);
  });
});

describe("normalizeChangelogEntries", () => {
  test("字符串输入 → 走 parseChangelogContent", () => {
    const raw = JSON.stringify([{ type: "功能", value: "x" }]);
    expect(normalizeChangelogEntries(raw)).toEqual([{ type: "功能", value: "x" }]);
  });

  test("数组输入 → 规整每条(type 非法回退「其他」+ value 转字符串)", () => {
    const input = [
      { type: "功能", value: "新功能" },
      { type: "bad", value: "x" },
      { type: "修复", value: 42 },
    ];
    expect(normalizeChangelogEntries(input)).toEqual([
      { type: "功能", value: "新功能" },
      { type: "其他", value: "x" },
      { type: "修复", value: "42" },
    ]);
  });

  test("非字符串非数组(对象/null/数字)→ 空数组", () => {
    expect(normalizeChangelogEntries(null)).toEqual([]);
    expect(normalizeChangelogEntries(undefined)).toEqual([]);
    expect(normalizeChangelogEntries({})).toEqual([]);
    expect(normalizeChangelogEntries(42)).toEqual([]);
    expect(normalizeChangelogEntries(true)).toEqual([]);
  });

  test("数组含非对象条目 → 过滤", () => {
    expect(normalizeChangelogEntries([
      "x",
      null,
      { type: "功能", value: "valid" },
    ])).toEqual([{ type: "功能", value: "valid" }]);
  });
});

describe("stringifyChangelogContent", () => {
  test("序列化为 JSON 字符串(与 parse 往返)", () => {
    const entries = [{ type: "功能", value: "x" }];
    const raw = stringifyChangelogContent(entries);
    expect(raw).toBe(JSON.stringify(entries));
    expect(parseChangelogContent(raw)).toEqual(entries);
  });

  test("空数组 → '[]'", () => {
    expect(stringifyChangelogContent([])).toBe("[]");
  });
});

describe("renderChangelogEntries / renderChangelogContent", () => {
  test("renderChangelogEntries 每条带 html(renderSimpleMarkdown 渲染 value)", () => {
    const entries = [{ type: "功能", value: "**bold**" }];
    const out = renderChangelogEntries(entries);
    expect(out).toHaveLength(1);
    expect(out[0]?.type).toBe("功能");
    expect(out[0]?.value).toBe("**bold**");
    // 简单 markdown 至少把 **bold** 转成 <strong>
    expect(out[0]?.html).toContain("<strong>bold</strong>");
  });

  test("value 为空 → html 至少是空串或纯标签(不抛)", () => {
    const out = renderChangelogEntries([{ type: "功能", value: "" }]);
    expect(out[0]?.html).toBeDefined();
  });

  test("renderChangelogContent:DB 原始串 → 直接拿到带 html 的对外条目", () => {
    const raw = JSON.stringify([{ type: "功能", value: "**bold**" }]);
    const out = renderChangelogContent(raw);
    expect(out[0]?.html).toContain("<strong>bold</strong>");
  });

  test("renderChangelogContent(null) → 空数组", () => {
    expect(renderChangelogContent(null)).toEqual([]);
    expect(renderChangelogContent(undefined)).toEqual([]);
    expect(renderChangelogContent("")).toEqual([]);
  });
});