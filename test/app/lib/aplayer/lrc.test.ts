import { afterEach, describe, expect, test } from "bun:test";

import "./setup-globals";

import Lrc from "~/lib/aplayer/lrc";

// 构造最小 player mock:list.audios[index].lrc / list.index / audio.currentTime
// events.trigger + template.lrcWrap + template.playedWrap 等
function makePlayerMock(opts: {
  audios: Array<{ lrc: string }>;
  index?: number;
}) {
  const triggered: Array<[string, unknown]> = [];
  return {
    list: {
      audios: opts.audios,
      index: opts.index ?? 0,
    },
    audio: {
      currentTime: 0,
    },
    events: {
      trigger(name: string, data?: unknown) {
        triggered.push([name, data]);
      },
    },
    template: {
      lrcWrap: document.createElement("div"),
      playedWrap: document.createElement("div"),
    },
    _triggered: triggered,
  };
}

afterEach(() => {
  // 不清,setup-globals 已建 happy-dom window,无需每 test 关
});

describe("Lrc.parse(纯函数)", () => {
  test("标准格式:每行 [mm:ss]lyric → [[秒, 文本]] 数组", () => {
    const lrc = new Lrc({ player: makePlayerMock({ audios: [] }) as never, container: document.createElement("div"), async: false });
    const out = lrc.parse("[00:01.00]hello\n[00:05.50]world");
    expect(out).toEqual([
      [1, "hello"],
      [5.5, "world"],
    ]);
  });

  test("毫秒精度:.xxx 转 1/1000 秒", () => {
    const lrc = new Lrc({ player: makePlayerMock({ audios: [] }) as never, container: document.createElement("div"), async: false });
    const out = lrc.parse("[00:01.500]精确 500ms");
    expect(out[0]?.[0]).toBe(1.5);
  });

  test("2 位毫秒转 1/100 秒(如 .50 → 0.5)", () => {
    const lrc = new Lrc({ player: makePlayerMock({ audios: [] }) as never, container: document.createElement("div"), async: false });
    const out = lrc.parse("[00:02.50]half sec");
    expect(out[0]?.[0]).toBe(2.5);
  });

  test("多时间标签同一行(同一文本多次出现)", () => {
    const lrc = new Lrc({ player: makePlayerMock({ audios: [] }) as never, container: document.createElement("div"), async: false });
    const out = lrc.parse("[00:01.00][00:05.00]chorus");
    expect(out).toEqual([
      [1, "chorus"],
      [5, "chorus"],
    ]);
  });

  test("空歌词 → 空数组", () => {
    const lrc = new Lrc({ player: makePlayerMock({ audios: [] }) as never, container: document.createElement("div"), async: false });
    expect(lrc.parse("")).toEqual([]);
  });

  test("排序:乱序时间标签按时间升序", () => {
    const lrc = new Lrc({ player: makePlayerMock({ audios: [] }) as never, container: document.createElement("div"), async: false });
    const out = lrc.parse("[00:05.00]b\n[00:01.00]a\n[00:03.00]c");
    expect(out.map(x => x[1])).toEqual(["a", "c", "b"]);
  });

  test("空文本行被过滤", () => {
    const lrc = new Lrc({ player: makePlayerMock({ audios: [] }) as never, container: document.createElement("div"), async: false });
    const out = lrc.parse("[00:01.00]hello\n[00:05.00]\n[00:10.00]world");
    expect(out).toEqual([
      [1, "hello"],
      [10, "world"],
    ]);
  });

  test("无时间标签行被忽略", () => {
    const lrc = new Lrc({ player: makePlayerMock({ audios: [] }) as never, container: document.createElement("div"), async: false });
    const out = lrc.parse("garbage line\n[00:01.00]real");
    expect(out).toEqual([[1, "real"]]);
  });

  test("行内多个时间标签被 split(逻辑修复:`][` 前未换行的也切开)", () => {
    // 注释里 `replace(/([^\]^\n])\[/g, ...)` 处理的是「上个文本后无换行紧跟新时间标签」
    // 像 "text[00:05.00]more" 这种,会切分后再解析
    const lrc = new Lrc({ player: makePlayerMock({ audios: [] }) as never, container: document.createElement("div"), async: false });
    const out = lrc.parse("[00:01.00]text[00:05.00]more");
    expect(out).toEqual([
      [1, "text"],
      [5, "more"],
    ]);
  });
});

describe("Lrc.show / hide / toggle", () => {
  test("show → classList 移除 aplayer-lrc-hide + 触发 lrcshow 事件", () => {
    const player = makePlayerMock({ audios: [] });
    const container = document.createElement("div");
    const lrc = new Lrc({ player: player as never, container, async: false });
    player.template.lrcWrap.classList.add("aplayer-lrc-hide");

    lrc.show();

    expect(player.template.lrcWrap.classList.contains("aplayer-lrc-hide")).toBe(false);
    expect(player._triggered.some(([n]) => n === "lrcshow")).toBe(true);
  });

  test("hide → classList 加 aplayer-lrc-hide + 触发 lrchide 事件", () => {
    const player = makePlayerMock({ audios: [] });
    const container = document.createElement("div");
    const lrc = new Lrc({ player: player as never, container, async: false });

    lrc.hide();

    expect(player.template.lrcWrap.classList.contains("aplayer-lrc-hide")).toBe(true);
    expect(player._triggered.some(([n]) => n === "lrchide")).toBe(true);
  });

  test("toggle 在 hide 状态 → show;在 show 状态 → hide", () => {
    const player = makePlayerMock({ audios: [] });
    const container = document.createElement("div");
    const lrc = new Lrc({ player: player as never, container, async: false });

    // 初始是 show 状态 → toggle 触发 hide
    lrc.toggle();
    expect(player.template.lrcWrap.classList.contains("aplayer-lrc-hide")).toBe(true);

    // 现在 hide → toggle 触发 show
    lrc.toggle();
    expect(player.template.lrcWrap.classList.contains("aplayer-lrc-hide")).toBe(false);
  });
});

describe("Lrc.remove / clear", () => {
  test("remove(index) → 同时删 parsed 和 loading 数组对应位", () => {
    const player = makePlayerMock({ audios: [] });
    const lrc = new Lrc({ player: player as never, container: document.createElement("div"), async: false });
    lrc.parsed = [
      [[1, "a"]],
      [[2, "b"]],
      [[3, "c"]],
    ];
    lrc.loading = [false, false, false];
    lrc.remove(1);
    expect(lrc.parsed).toEqual([[[1, "a"]], [[3, "c"]]]);
    expect(lrc.loading).toEqual([false, false]);
  });

  test("clear → 数组清空 + 容器 innerHTML 清空", () => {
    const player = makePlayerMock({ audios: [] });
    const container = document.createElement("div");
    container.innerHTML = "<p>old</p>";
    const lrc = new Lrc({ player: player as never, container, async: false });
    lrc.parsed = [[[1, "x"]]];
    lrc.loading = [true];
    lrc.clear();
    expect(lrc.parsed).toEqual([]);
    expect(lrc.loading).toEqual([]);
    expect(container.innerHTML).toBe("");
  });
});

describe("Lrc.sync 模式(switch + 同步歌词)", () => {
  test("lrc 是字符串(同步)→ 直接 parse + 渲染", () => {
    const player = makePlayerMock({ audios: [{ lrc: "[00:01.00]sync\n[00:05.00]line" }] });
    const container = document.createElement("div");
    const lrc = new Lrc({ player: player as never, container, async: false });
    lrc.switch(0);
    expect(lrc.parsed[0]).toEqual([[1, "sync"], [5, "line"]]);
    // 渲染进容器
    expect(container.innerHTML).toContain("sync");
    expect(container.innerHTML).toContain("line");
  });

  test("lrc 字符串为空 → 渲染 'Not available'", () => {
    const player = makePlayerMock({ audios: [{ lrc: "" }] });
    const container = document.createElement("div");
    const lrc = new Lrc({ player: player as never, container, async: false });
    lrc.switch(0);
    expect(container.innerHTML).toContain("Not available");
  });
});

describe("Lrc.update(高亮当前行)", () => {
  test("currentTime 走到某行 → 该行加 'aplayer-lrc-current' class", () => {
    const player = makePlayerMock({ audios: [{ lrc: "[00:00.00]a\n[00:05.00]b\n[00:10.00]c" }] });
    const container = document.createElement("div");
    const lrc = new Lrc({ player: player as never, container, async: false });
    lrc.switch(0);
    // 初始 highlight 第 0 行(a)
    expect(container.getElementsByClassName("aplayer-lrc-current")).toHaveLength(1);
    expect(container.getElementsByClassName("aplayer-lrc-current")[0]?.textContent).toBe("a");

    // 走到 7 秒 → highlight 第 1 行(b)
    player.audio.currentTime = 7;
    lrc.update();
    expect(container.getElementsByClassName("aplayer-lrc-current")[0]?.textContent).toBe("b");

    // 走到 12 秒 → highlight 第 2 行(c)
    player.audio.currentTime = 12;
    lrc.update();
    expect(container.getElementsByClassName("aplayer-lrc-current")[0]?.textContent).toBe("c");
  });
});