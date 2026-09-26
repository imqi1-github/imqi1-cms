import { afterEach, beforeEach, describe, expect, test } from "bun:test";
import { Window } from "happy-dom";

import Bar from "~/lib/aplayer/bar";

let win: Window;

beforeEach(() => {
  win = new Window();
  Object.assign(globalThis, {
    document: win.document,
    HTMLElement: win.HTMLElement,
  });
});

afterEach(() => {
  win.close();
});

function makeTemplate() {
  const volume = win.document.createElement("div");
  const played = win.document.createElement("div");
  const loaded = win.document.createElement("div");
  return { volume, played, loaded };
}

describe("Bar.set(防 NaN% 钳制)", () => {
  test("0..1 范围 → 写到 style[direction] 为百分比", () => {
    const tpl = makeTemplate();
    const bar = new Bar(tpl);
    bar.set("played", 0.5, "width");
    expect(tpl.played.style.width).toBe("50%");
  });

  test("边界:0 → 0%", () => {
    const tpl = makeTemplate();
    const bar = new Bar(tpl);
    bar.set("played", 0, "width");
    expect(tpl.played.style.width).toBe("0%");
  });

  test("边界:1 → 100%", () => {
    const tpl = makeTemplate();
    const bar = new Bar(tpl);
    bar.set("volume", 1, "height");
    expect(tpl.volume.style.height).toBe("100%");
  });

  test("超过 1 → 钳到 100%(不会写 NaN%/越界值)", () => {
    const tpl = makeTemplate();
    const bar = new Bar(tpl);
    bar.set("played", 1.5, "width");
    expect(tpl.played.style.width).toBe("100%");
  });

  test("负数 → 钳到 0%", () => {
    const tpl = makeTemplate();
    const bar = new Bar(tpl);
    bar.set("loaded", -0.5, "width");
    expect(tpl.loaded.style.width).toBe("0%");
  });

  test("NaN → 兜底 0%(0/0 时常见;切歌瞬间 duration=0)", () => {
    const tpl = makeTemplate();
    const bar = new Bar(tpl);
    bar.set("played", NaN, "width");
    expect(tpl.played.style.width).toBe("0%");
  });

  test("Infinity → 兜底 0%", () => {
    const tpl = makeTemplate();
    const bar = new Bar(tpl);
    bar.set("played", Infinity, "width");
    expect(tpl.played.style.width).toBe("0%");
  });

  test("-Infinity → 兜底 0%", () => {
    const tpl = makeTemplate();
    const bar = new Bar(tpl);
    bar.set("volume", -Infinity, "height");
    expect(tpl.volume.style.height).toBe("0%");
  });

  test("三种 BarType 都可写(volume/played/loaded)", () => {
    const tpl = makeTemplate();
    const bar = new Bar(tpl);
    bar.set("volume", 0.3, "height");
    bar.set("played", 0.4, "width");
    bar.set("loaded", 0.5, "width");
    expect(tpl.volume.style.height).toBe("30%");
    expect(tpl.played.style.width).toBe("40%");
    expect(tpl.loaded.style.width).toBe("50%");
  });
});

describe("Bar.get(读百分比)", () => {
  test("刚写 0.5 → get 返回 0.5", () => {
    const tpl = makeTemplate();
    const bar = new Bar(tpl);
    bar.set("played", 0.5, "width");
    expect(bar.get("played", "width")).toBeCloseTo(0.5, 5);
  });

  test("未写过 / style 为空 → get 返回 0(parseFloat NaN 兜底)", () => {
    const tpl = makeTemplate();
    const bar = new Bar(tpl);
    expect(bar.get("played", "width")).toBe(0);
  });

  test("round-trip:set → get 等值(0.75)", () => {
    const tpl = makeTemplate();
    const bar = new Bar(tpl);
    bar.set("volume", 0.75, "height");
    expect(bar.get("volume", "height")).toBeCloseTo(0.75, 5);
  });

  test("round-trip:钳制后的 1.5 → set 100% → get 1", () => {
    const tpl = makeTemplate();
    const bar = new Bar(tpl);
    bar.set("played", 1.5, "width");
    expect(bar.get("played", "width")).toBe(1);
  });
});