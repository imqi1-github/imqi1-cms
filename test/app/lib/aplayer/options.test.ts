import "./setup-globals";

import { describe, expect, test } from "bun:test";

import resolveOptions from "~/lib/aplayer/options";

describe("resolveOptions 默认值", () => {
  test("缺 container/element → 抛 'APlayer: container is required'", () => {
    expect(() => resolveOptions({})).toThrow(/container is required/);
  });

  test("container 提供 → 通过,默认 volume=0.7", () => {
    const el = document.createElement("div");
    const r = resolveOptions({ container: el });
    expect(r.volume).toBe(0.7);
    expect(r.container).toBe(el);
  });

  test("element 别名 = container(兼容老 API)", () => {
    const el = document.createElement("div");
    const r = resolveOptions({ element: el });
    expect(r.container).toBe(el);
  });

  test("mutex=true / loop='all' / order='list' / lrcType=0 默认", () => {
    const r = resolveOptions({ container: document.createElement("div") });
    expect(r.mutex).toBe(true);
    expect(r.loop).toBe("all");
    expect(r.order).toBe("list");
    expect(r.lrcType).toBe(0);
  });

  test("narrow / fixed → mini=true", () => {
    expect(resolveOptions({ container: document.createElement("div"), narrow: true }).mini).toBe(true);
    expect(resolveOptions({ container: document.createElement("div"), fixed: true }).mini).toBe(true);
  });

  test("用户传入 loop='none' → 不被默认 loop='all' 覆盖", () => {
    const r = resolveOptions({ container: document.createElement("div"), loop: "none" });
    expect(r.loop).toBe("none");
  });

  test("preload='metadata' 默认 + storageName='aplayer-setting'", () => {
    const r = resolveOptions({ container: document.createElement("div") });
    expect(r.preload).toBe("metadata");
    expect(r.storageName).toBe("aplayer-setting");
  });
});

describe("resolveOptions audio 处理", () => {
  test("audio 缺 → 空数组", () => {
    const r = resolveOptions({ container: document.createElement("div") });
    expect(r.audio).toEqual([]);
  });

  test("audio 单个对象 → 数组化", () => {
    const r = resolveOptions({
      container: document.createElement("div"),
      music: { name: "a", artist: "b", url: "u", cover: "c" },
    });
    expect(Array.isArray(r.audio)).toBe(true);
    expect(r.audio).toHaveLength(1);
  });

  test("audio 已为数组 → 保留", () => {
    const r = resolveOptions({
      container: document.createElement("div"),
      audio: [
        { name: "x", url: "u1" },
        { name: "y", url: "u2" },
      ],
    });
    expect(r.audio).toHaveLength(2);
  });

  test("audio 缺 name → 走 title 兜底,再无则 'Audio name'", () => {
    const r = resolveOptions({
      container: document.createElement("div"),
      audio: [{ url: "u", title: "from-title" }],
    });
    expect(r.audio[0]?.name).toBe("from-title");
    const r2 = resolveOptions({
      container: document.createElement("div"),
      audio: [{ url: "u" }],
    });
    expect(r2.audio[0]?.name).toBe("Audio name");
  });

  test("audio 缺 artist → 走 author 兜底,再无则 'Audio artist'", () => {
    const r = resolveOptions({
      container: document.createElement("div"),
      audio: [{ url: "u", author: "from-author" }],
    });
    expect(r.audio[0]?.artist).toBe("from-author");
    const r2 = resolveOptions({
      container: document.createElement("div"),
      audio: [{ url: "u" }],
    });
    expect(r2.audio[0]?.artist).toBe("Audio artist");
  });

  test("audio 缺 cover → 走 pic 兜底", () => {
    const r = resolveOptions({
      container: document.createElement("div"),
      audio: [{ url: "u", pic: "from-pic" }],
    });
    expect(r.audio[0]?.cover).toBe("from-pic");
  });

  test("audio 缺 type → 默认 'auto'(让 m3u8/HLS 自动识别)", () => {
    const r = resolveOptions({
      container: document.createElement("div"),
      audio: [{ url: "u" }],
    });
    expect(r.audio[0]?.type).toBe("auto");
  });

  test("audio 缺 url → 过滤掉(避免 <audio src=undefined>)", () => {
    const r = resolveOptions({
      container: document.createElement("div"),
      audio: [
        { name: "with url", url: "u" },
        { name: "no url" },
      ],
    });
    expect(r.audio).toHaveLength(1);
    expect(r.audio[0]?.name).toBe("with url");
  });
});

describe("resolveOptions loop 修正", () => {
  test("audio ≤ 1 + loop='one' → 强制 loop='all'(单曲循环无意义)", () => {
    const r = resolveOptions({
      container: document.createElement("div"),
      audio: [{ url: "u" }],
      loop: "one",
    });
    expect(r.loop).toBe("all");
  });

  test("audio > 1 + loop='one' → 保留 loop='one'", () => {
    const r = resolveOptions({
      container: document.createElement("div"),
      audio: [
        { url: "u1" },
        { url: "u2" },
      ],
      loop: "one",
    });
    expect(r.loop).toBe("one");
  });

  test("audio 0 + loop='one' → loop='all'", () => {
    const r = resolveOptions({
      container: document.createElement("div"),
      audio: [],
      loop: "one",
    });
    expect(r.loop).toBe("all");
  });
});

describe("resolveOptions listMaxHeight", () => {
  test("listmaxheight(老字段) → 转浮点存到 listMaxHeight", () => {
    const r = resolveOptions({
      container: document.createElement("div"),
      listmaxheight: "320",
    });
    expect(r.listMaxHeight).toBe(320);
  });

  test("数字 320 → 原样", () => {
    const r = resolveOptions({
      container: document.createElement("div"),
      listMaxHeight: 320,
    });
    expect(r.listMaxHeight).toBe(320);
  });

  test("未传 listmaxheight/listMaxHeight → 默认 260", () => {
    const r = resolveOptions({ container: document.createElement("div") });
    expect(r.listMaxHeight).toBe(260);
  });
});