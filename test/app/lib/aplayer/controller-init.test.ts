// controller.ts 简单 init* 方法单测:每个 init 是 1 行 addEventListener 调用 player.xxx 方法。
// 拖拽相关(initPlayBar/initVolumeButton)详见 controller-drag.test.ts。
// 注:Template class 有 ~33 个字段(全部 HTMLElement),player 方法 ~10 个,本 stub 全 mock。
import { afterEach, beforeEach, describe, expect, test } from "bun:test";
import { Window } from "happy-dom";

import "#test/app/lib/aplayer/setup-globals";

import Controller from "~/lib/aplayer/controller";

let win: Window;
let origEl: typeof HTMLElement;

// 全 template 字段(从 app/lib/aplayer/template.ts class Template 抄)
const TEMPLATE_FIELDS = [
  "lrc", "lrcWrap", "ptime", "info", "time", "barWrap", "body",
  "list", "listCurs", "played", "loaded", "thumb",
  "volume", "volumeBar", "volumeButton", "volumeBarWrap",
  "loop", "order", "menu", "pic", "title", "author",
  "dtime", "notice", "miniSwitcher",
  "skipBackButton", "skipForwardButton", "skipPlayButton",
  "lrcButton",
] as const;

type ControllerPlayer = ConstructorParameters<typeof Controller>[0];

function mkPlayerStubs(): {
  player: ControllerPlayer;
  calls: Record<string, unknown[]>;
} {
  const calls: Record<string, unknown[]> = {};
  const spy = (name: string) => (...args: unknown[]) => {
    (calls[name] ??= []).push(args);
  };

  // 创建所有 template 元素的真实 DOM 节点(代替 plain object stub)
  const template: Record<string, unknown> = {};
  for (const f of TEMPLATE_FIELDS) {
    if (f === "listCurs") template[f] = win.document.querySelectorAll("*"); // NodeListOf
    else template[f] = win.document.createElement("div");
  }
  // listCurs 是 NodeListOf<HTMLElement>,补一个真实 node list
  template.listCurs = win.document.body.querySelectorAll("*");

  const player = {
    template,
    toggle: spy("toggle"),
    bar: { set: spy("barSet") },
    setOrder: spy("setOrder"),
    setLoop: spy("setLoop"),
    switchMini: spy("switchMini"),
    skipForward: spy("skipForward"),
    skipBack: spy("skipBack"),
    list: { toggle: spy("listToggle") },
    lrc: { show: spy("lrcShow") },
    duration: 100,
    disableTimeupdate: false,
  } as unknown as ControllerPlayer;
  return { player, calls };
}

beforeEach(() => {
  win = new Window();
  origEl = globalThis.HTMLElement;
  Object.assign(globalThis, {
    window: win,
    document: win.document,
    HTMLElement: win.HTMLElement,
  });
});

afterEach(() => {
  win.close();
  globalThis.HTMLElement = origEl;
});

describe("Controller initPlayButton", () => {
  test("点击 pic → player.toggle() 被调", () => {
    const { player, calls } = mkPlayerStubs();
    new Controller(player);
    (player.template as { pic: HTMLElement }).pic.click();
    expect(calls.toggle).toHaveLength(1);
  });

  test("多次点击 → 多次 toggle(不防抖)", () => {
    const { player, calls } = mkPlayerStubs();
    new Controller(player);
    const pic = (player.template as { pic: HTMLElement }).pic;
    pic.click();
    pic.click();
    pic.click();
    expect(calls.toggle).toHaveLength(3);
  });
});

describe("Controller initSkipButton", () => {
  test("点击 skipBackButton → player.skipBack 被调", () => {
    const { player, calls } = mkPlayerStubs();
    new Controller(player);
    (player.template as { skipBackButton: HTMLElement }).skipBackButton.click();
    expect(calls.skipBack).toHaveLength(1);
  });

  test("点击 skipForwardButton → player.skipForward 被调", () => {
    const { player, calls } = mkPlayerStubs();
    new Controller(player);
    (player.template as { skipForwardButton: HTMLElement }).skipForwardButton.click();
    expect(calls.skipForward).toHaveLength(1);
  });
});

describe("Controller initLrcButton", () => {
  test("点击 lrcButton(无 inactivity 类)→ 不调 lrc.show(空 classList)", () => {
    // initLrcButton 看 classList 含 'aplayer-icon-lrc-inactivity' 才调 lrc.show,
    // 否则不调。createElement("div") classList 空 → 不调。
    const { player, calls } = mkPlayerStubs();
    new Controller(player);
    (player.template as { lrcButton: HTMLElement }).lrcButton.click();
    expect(calls.lrcShow).toBeUndefined();
  });

  test("点击 lrcButton 带 inactivity 类 → player.lrc.show() 被调", () => {
    const { player, calls } = mkPlayerStubs();
    new Controller(player);
    const lrcBtn = (player.template as { lrcButton: HTMLElement }).lrcButton;
    lrcBtn.classList.add("aplayer-icon-lrc-inactivity");
    lrcBtn.click();
    expect(calls.lrcShow).toHaveLength(1);
  });
});

describe("Controller initMenuButton", () => {
  test("点击 menu → player.list.toggle() 被调", () => {
    const { player, calls } = mkPlayerStubs();
    new Controller(player);
    (player.template as { menu: HTMLElement }).menu.click();
    expect(calls.listToggle).toHaveLength(1);
  });
});

describe("Controller 构造完整性", () => {
  test("完整 APlayer stub + 构造不抛(覆盖所有 init* 一次跑通)", () => {
    const { player } = mkPlayerStubs();
    expect(() => new Controller(player)).not.toThrow();
  });
});
