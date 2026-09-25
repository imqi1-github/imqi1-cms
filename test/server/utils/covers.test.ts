import { describe, expect, test } from "bun:test";

import { parseCovers } from "#server/utils/covers";

describe("parseCovers", () => {
  test("标准对象数组:title→desc,宽高转数字", () => {
    const r = parseCovers(JSON.stringify([{ url: "/uploads/a.jpg", title: "封面一", width: 800, height: 600 }]));
    expect(r).toEqual([{ url: "/uploads/a.jpg", desc: "封面一", width: 800, height: 600 }]);
  });

  test("兼容历史纯字符串数组", () => {
    expect(parseCovers(JSON.stringify(["/uploads/a.jpg"]))).toEqual([
      { url: "/uploads/a.jpg", desc: "", width: null, height: null },
    ]);
  });

  test("兼容 cover/desc 别名与非法宽高", () => {
    expect(parseCovers(JSON.stringify([{ cover: "/uploads/b.jpg", desc: "d", width: "800", height: Number.NaN }]))).toEqual([
      { url: "/uploads/b.jpg", desc: "d", width: null, height: null },
    ]);
  });

  test("空输入/坏 JSON/非数组 → []", () => {
    expect(parseCovers(null)).toEqual([]);
    expect(parseCovers(undefined)).toEqual([]);
    expect(parseCovers("")).toEqual([]);
    expect(parseCovers("{bad json")).toEqual([]);
    expect(parseCovers(JSON.stringify({ url: "x" }))).toEqual([]);
  });

  test("无 url 的条目被过滤掉", () => {
    expect(parseCovers(JSON.stringify([{ title: "只有标题" }, { url: "/ok.jpg" }]))).toEqual([
      { url: "/ok.jpg", desc: "", width: null, height: null },
    ]);
  });

  test("null 条目安全处理", () => {
    expect(parseCovers(JSON.stringify([null]))).toEqual([]);
  });
});
