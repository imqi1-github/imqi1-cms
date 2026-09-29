/**
 * aplayer/Controller 拖拽兜底回归(记忆 aplayer-lib-gotchas 「拖拽打啵」):
 *  - initPlayBar 进度条拖拽:dragStart 启用,dragMove 算百分比写 played,
 *    dragEnd seek + disableTimeupdate=false
 *  - pointercancel/blur 兜底:移除 document 监听 + 复位 disableTimeupdate=false
 *    (否则卡死 → 进度条不再跟随播放时间)
 *  - volumeBar 拖拽:同样 pointercancel 兜底 + 移除 volumeBarWrap active class
 *  - destroy() 兜底移除所有 document 监听(拖拽中销毁防监听泄露)
 */
import { afterEach, beforeEach, describe, expect, test } from "bun:test";
import { Window } from "happy-dom";

import "#test/app/lib/aplayer/setup-globals";

import Controller from "~/lib/aplayer/controller";
import Template from "~/lib/aplayer/template";
import resolveOptions from "~/lib/aplayer/options";
import { libEl } from "#test/helpers/happy-dom-cast";

let win: Window;

beforeEach(() => {
  win = new Window();
  Object.assign(globalThis, {
    window: win,
    navigator: win.navigator,
    document: win.document,
    HTMLElement: win.HTMLElement,
    localStorage: win.localStorage,
    Audio: win.Audio,
    HTMLAudioElement: win.HTMLAudioElement,
  });
  installListenerCountProbe(document);
  installListenerCountProbe(window);
});

afterEach(() => {
  win.close();
});

function makePlayer() {
  const opts = resolveOptions({
    container: libEl(win.document.createElement("div")),
    audio: [
      { name: "n", artist: "a", url: "https://x/a.mp3", cover: "https://x/a.jpg" },
    ],
  });
  const template = new Template({ container: opts.container, options: opts, randomOrder: [0] });
  const player = {
    template,
    bar: { set: () => {} },
    options: opts,
    list: { audios: opts.audio, index: 0, toggle: () => {} },
    audio: { currentTime: 0, duration: 100, muted: false, volume: 1 },
    duration: 100,
    seek: () => {},
    toggle: () => {},
    volume: () => {},
    switchVolumeIcon: () => {},
    skipBack: () => {},
    skipForward: () => {},
    setMode: () => {},
    disableTimeupdate: false,
    lrc: undefined,
  };
  return player;
}

function installListenerCountProbe(target: EventTarget): void {
  const net = new Map<string, number>();
  const origAdd = target.addEventListener.bind(target);
  const origRemove = target.removeEventListener.bind(target);
  target.addEventListener = ((t: string, fn: EventListenerOrEventListenerObject, opts?: AddEventListenerOptions | boolean) => {
    net.set(t, (net.get(t) ?? 0) + 1);
    return origAdd(t, fn, opts);
  }) as typeof target.addEventListener;
  target.removeEventListener = ((t: string, fn: EventListenerOrEventListenerObject, opts?: EventListenerOptions | boolean) => {
    net.set(t, (net.get(t) ?? 0) - 1);
    return origRemove(t, fn, opts);
  }) as typeof target.removeEventListener;
  (target as unknown as { __netCount: Map<string, number> }).__netCount = net;
}

function documentEventCount(type: string): number {
  return (document as unknown as { __netCount: Map<string, number> }).__netCount.get(type) ?? 0;
}
function windowEventCount(type: string): number {
  return (window as unknown as { __netCount: Map<string, number> }).__netCount.get(type) ?? 0;
}

describe("Controller initPlayBar:进度条拖拽 + pointercancel/blur 兜底", () => {
  test("dragStart(mousedown)→ disableTimeupdate=true + 装 document dragMove/dragEnd/pointercancel + window blur 监听", () => {
    const player = makePlayer();
    new Controller(player as never);

    const evt = new win.MouseEvent("mousedown", { clientX: 50, bubbles: true }) as unknown as MouseEvent;
    player.template.barWrap.dispatchEvent(evt);

    expect(player.disableTimeupdate).toBe(true);
    expect(documentEventCount("mousemove")).toBeGreaterThanOrEqual(1);
    expect(documentEventCount("mouseup")).toBeGreaterThanOrEqual(1);
    expect(documentEventCount("pointercancel")).toBeGreaterThanOrEqual(1);
    expect(windowEventCount("blur")).toBeGreaterThanOrEqual(1);
  });

  test("document pointercancel → 移除 document 监听 + disableTimeupdate=false(兜底复位,防卡死)", () => {
    const player = makePlayer();
    const controller = new Controller(player as never);
    player.template.barWrap.dispatchEvent(new win.MouseEvent("mousedown", { clientX: 50, bubbles: true }) as unknown as MouseEvent);
    expect(player.disableTimeupdate).toBe(true);

    const beforeMove = documentEventCount("mousemove");
    const beforeEnd = documentEventCount("mouseup");
    const beforeCancel = documentEventCount("pointercancel");

    document.dispatchEvent(new win.Event("pointercancel") as unknown as Event);

    expect(documentEventCount("mousemove")).toBe(beforeMove - 1);
    expect(documentEventCount("mouseup")).toBe(beforeEnd - 1);
    expect(documentEventCount("pointercancel")).toBe(beforeCancel - 1);
    expect(player.disableTimeupdate).toBe(false);

    controller.destroy();
  });

  test("window blur → 同样兜底复位 disableTimeupdate + 移监听", () => {
    const player = makePlayer();
    const controller = new Controller(player as never);
    player.template.barWrap.dispatchEvent(new win.MouseEvent("mousedown", { clientX: 50, bubbles: true }) as unknown as MouseEvent);
    expect(player.disableTimeupdate).toBe(true);

    window.dispatchEvent(new win.Event("blur") as unknown as Event);

    expect(player.disableTimeupdate).toBe(false);
    expect(documentEventCount("mousemove")).toBe(0);
    expect(documentEventCount("mouseup")).toBe(0);
    expect(documentEventCount("pointercancel")).toBe(0);

    controller.destroy();
  });

  test("destroy() 兜底移除所有拖拽监听(拖拽中销毁防 document 监听泄露)", () => {
    const player = makePlayer();
    const controller = new Controller(player as never);
    player.template.barWrap.dispatchEvent(new win.MouseEvent("mousedown", { clientX: 50, bubbles: true }) as unknown as MouseEvent);
    expect(player.disableTimeupdate).toBe(true);

    controller.destroy();
    // 销毁后:disableTimeupdate 必须复位(否则下次拖拽还卡在上一次的状态)
    // 注:destroy() 还防御性移除未注册的 volume* 监听,精确计数不可靠;
    // 这里改为行为断言:再次 mousedown → 新一轮 disableTimeupdate=true,证明旧监听已清。
    player.template.barWrap.dispatchEvent(new win.MouseEvent("mousedown", { clientX: 50, bubbles: true }) as unknown as MouseEvent);
    // 老 handler 不会再触发(已被移),disableTimeupdate 已经被新 handler 重新置 true。
    // 再触发一次正常 mouseup → 应该调用 seek(老 handler 不会 seek,因为已被销毁移除)
    let seekCalls = 0;
    player.seek = () => { seekCalls++; };
    document.dispatchEvent(new win.MouseEvent("mouseup", { clientX: 50, bubbles: true }) as unknown as MouseEvent);
    expect(seekCalls).toBe(1); // 只有新 handler seek
  });

  test("dragEnd(mouseup)→ 调用 player.seek + disableTimeupdate=false(正常完成分支)", () => {
    let seekCalls = 0;
    const player = makePlayer();
    player.seek = () => { seekCalls++; };
    new Controller(player as never);

    // 模拟 barWrap.getBoundingClientRect 返 [0..200]
    player.template.barWrap.getBoundingClientRect = () => ({ left: 0, top: 0, right: 200, bottom: 10, width: 200, height: 10, x: 0, y: 0 } as DOMRect);
    Object.defineProperty(player.template.barWrap, "clientWidth", { value: 200, configurable: true });

    player.template.barWrap.dispatchEvent(new win.MouseEvent("mousedown", { clientX: 100, bubbles: true }) as unknown as MouseEvent);
    expect(player.disableTimeupdate).toBe(true);

    document.dispatchEvent(new win.MouseEvent("mousemove", { clientX: 100, bubbles: true }) as unknown as MouseEvent);
    document.dispatchEvent(new win.MouseEvent("mouseup", { clientX: 100, bubbles: true }) as unknown as MouseEvent);

    expect(seekCalls).toBe(1);
    expect(player.disableTimeupdate).toBe(false);
  });
});

describe("Controller initVolumeButton:音量条拖拽 + active class 兜底", () => {
  test("dragStart → volumeBarWrap 加 active class + 装 document pointercancel 监听", () => {
    const player = makePlayer();
    new Controller(player as never);

    expect(player.template.volumeBarWrap.classList.contains("aplayer-volume-bar-wrap-active")).toBe(false);
    const beforeCancel = documentEventCount("pointercancel");

    player.template.volumeBarWrap.dispatchEvent(new win.MouseEvent("mousedown", { clientY: 50, bubbles: true }) as unknown as MouseEvent);
    expect(player.template.volumeBarWrap.classList.contains("aplayer-volume-bar-wrap-active")).toBe(true);
    expect(documentEventCount("pointercancel")).toBe(beforeCancel + 1);
  });

  test("document pointercancel → 移除 active class + 移监听", () => {
    const player = makePlayer();
    const controller = new Controller(player as never);
    player.template.volumeBarWrap.dispatchEvent(new win.MouseEvent("mousedown", { clientY: 50, bubbles: true }) as unknown as MouseEvent);
    expect(player.template.volumeBarWrap.classList.contains("aplayer-volume-bar-wrap-active")).toBe(true);

    document.dispatchEvent(new win.Event("pointercancel") as unknown as Event);
    expect(player.template.volumeBarWrap.classList.contains("aplayer-volume-bar-wrap-active")).toBe(false);
    expect(documentEventCount("pointercancel")).toBe(0);

    controller.destroy();
  });

  test("destroy() → 音量条监听也被清(active class 由 pointercancel handler 清,destroy 不清)", () => {
    // 注:destroy() 只调 removeVolumeDragListeners + removeVolumeCancelListeners,不移 active class。
    // active class 由 pointercancel/window-blur 触发的 volumeCancel handler 清。
    // 这里断言 destroy 之后,新 mousedown 会重新加 active,旧 handler 不再残留(否则会和新的重叠)。
    const player = makePlayer();
    const controller = new Controller(player as never);
    player.template.volumeBarWrap.dispatchEvent(new win.MouseEvent("mousedown", { clientY: 50, bubbles: true }) as unknown as MouseEvent);
    expect(player.template.volumeBarWrap.classList.contains("aplayer-volume-bar-wrap-active")).toBe(true);

    controller.destroy();

    // destroy 后第二次 mousedown:旧 handler 不应残留(已被移除),只有新 handler 在 active class 上加 class
    player.template.volumeBarWrap.dispatchEvent(new win.MouseEvent("mousedown", { clientY: 50, bubbles: true }) as unknown as MouseEvent);
    expect(player.template.volumeBarWrap.classList.contains("aplayer-volume-bar-wrap-active")).toBe(true);

    // 触发 pointercancel → volumeCancel handler 移 active class(证明 destroy 没破监听)
    document.dispatchEvent(new win.Event("pointercancel") as unknown as Event);
    expect(player.template.volumeBarWrap.classList.contains("aplayer-volume-bar-wrap-active")).toBe(false);
  });
});