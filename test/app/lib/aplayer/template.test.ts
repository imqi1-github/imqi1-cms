import { afterEach, beforeEach, describe, expect, test } from "bun:test";
import { Window as HappyWindow } from "happy-dom";

import "./setup-globals";

import Template from "~/lib/aplayer/template";
import resolveOptions from "~/lib/aplayer/options";

let win: InstanceType<typeof HappyWindow>;

beforeEach(() => {
  // fresh window/document per test
  win = new HappyWindow();
  Object.assign(globalThis, {
    window: win,
    navigator: win.navigator,
    document: win.document,
    HTMLElement: win.HTMLElement,
    localStorage: win.localStorage,
  });
});

afterEach(() => {
  win.close();
});

function makeOptions() {
  return resolveOptions({
    container: win.document.createElement("div"),
    audio: [
      { name: "song-a", artist: "artist-x", url: "https://x/a.mp3", cover: "https://x/a.jpg" },
    ],
  });
}

describe("Template 构造", () => {
  test("构造后 container.innerHTML 不为空(模板渲染了 aplayer 骨架)", () => {
    const options = makeOptions();
    const container = options.container;
    // options.container 在 options 解析时是 element;这里用 opts.container 直接
    new Template({ container, options, randomOrder: [0] });
    expect(container.innerHTML.length).toBeGreaterThan(100);
  });

  test("audio[0].cover 写入模板 img 标签", () => {
    const options = makeOptions();
    new Template({ container: options.container, options, randomOrder: [0] });
    expect(options.container.innerHTML).toContain("https://x/a.jpg");
  });

  test("randomOrder 不一致(order='list' 默认)→ 取 audio[0].cover", () => {
    const options = makeOptions();
    new Template({ container: options.container, options, randomOrder: [0] });
    // cover 通过模板渲染进 .aplayer-pic 的 background-image 风格
    expect(options.container.innerHTML).toContain("https://x/a.jpg");
  });

  test("order='random' + randomOrder[0]=n → 取 audio[n].cover", () => {
    const options = resolveOptions({
      container: win.document.createElement("div"),
      order: "random",
      audio: [
        { name: "first", url: "u1", cover: "first.jpg" },
        { name: "second", url: "u2", cover: "second.jpg" },
      ],
    });
    new Template({ container: options.container, options, randomOrder: [1] });
    // 第二个 audio 被选中
    expect(options.container.innerHTML).toContain("second.jpg");
    expect(options.container.innerHTML).not.toContain("first.jpg");
  });

  test("audio 空数组 → cover 不在 innerHTML 中", () => {
    const options = resolveOptions({ container: win.document.createElement("div") });
    expect(options.audio).toEqual([]);
    new Template({ container: options.container, options, randomOrder: [] });
    expect(options.container.innerHTML).not.toContain("https://x/a.jpg");
  });
});

describe("Template DOM 引用解析", () => {
  test("关键 DOM 元素都解析到非 null", () => {
    const options = makeOptions();
    const t = new Template({ container: options.container, options, randomOrder: [0] });
    // querySelector 至少返回元素(可能为 null 是空元素,但 happy-dom 应该能找到)
    expect(t.container).toBeDefined();
    // 模板应包含 .aplayer-info / .aplayer-bar-wrap / .aplayer-time 等
    expect(options.container.querySelector(".aplayer-info")).not.toBeNull();
    expect(options.container.querySelector(".aplayer-bar-wrap")).not.toBeNull();
    expect(options.container.querySelector(".aplayer-time")).not.toBeNull();
    expect(options.container.querySelector(".aplayer-pic")).not.toBeNull();
    expect(options.container.querySelector(".aplayer-title")).not.toBeNull();
    expect(options.container.querySelector(".aplayer-author")).not.toBeNull();
  });
});