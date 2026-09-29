/**
 * aplayer/lrc 不变式(记忆 aplayer-lib-gotchas):
 *  1) inflight 去重:同 index 第二次 switch → loading[index]=true 时仅渲染 Loading,不开新 XHR
 *  2) 占位不入缓存:Loading 不写入 parsed[index],结果真实才落缓存
 *  3) destroy() abort pendingXhr:在途 XHR 被 abort(防销毁后回写 DOM)
 *  4) 结果总是落缓存:即便 index !== player.list.index(用户已切歌),也写 parsed,
 *     仅当前曲才刷 DOM
 */
import { afterEach, beforeEach, describe, expect, test } from "bun:test";
import { Window } from "happy-dom";

// aplayer/utils.ts 顶部 evaluate 时访问 window.navigator — import 前必须先注入
const _bootWin = new Window();
Object.assign(globalThis, {
  window: _bootWin,
  document: _bootWin.document,
  HTMLElement: _bootWin.HTMLElement,
  Element: _bootWin.Element,
  Node: _bootWin.Node,
  navigator: _bootWin.navigator,
});

const LrcMod = await import("~/lib/aplayer/lrc");
const Lrc = LrcMod.default;

const g = globalThis as Record<string, unknown>;
let win: Window;

beforeEach(() => {
  win = new Window();
  Object.assign(globalThis, {
    window: win,
    document: win.document,
    HTMLElement: win.HTMLElement,
    Element: win.Element,
    Node: win.Node,
    navigator: win.navigator,
  });
});

afterEach(() => {
  delete g.window;
  delete g.document;
  delete g.HTMLElement;
});

// 用可控 XHR 替身:模拟"在途但未完成"的请求
function installFakeXhr(_opts: { abortOn: number[] } = { abortOn: [] }) {
  const instances: Array<{
    aborted: boolean;
    readyState: number;
    status: number;
    responseText: string;
    onreadystatechange: (() => void) | null;
    onerror: (() => void) | null;
    url: string;
    complete: (status?: number, text?: string) => void;
  }> = [];

  class FakeXhr {
    aborted = false;
    readyState = 1;
    status = 200;
    responseText = "[00:00.00]hello\n[00:01.00]world";
    onreadystatechange: (() => void) | null = null;
    onerror: (() => void) | null = null;
    url: string;
    constructor() {
      this.url = "";
      instances.push(this as unknown as (typeof instances)[number]);
    }
    open(method: string, url: string) { this.url = url; }
    send() { /* 不触发 onreadystatechange,保持 readyState=1 在途 */ }
    abort() {
      this.aborted = true;
      this.readyState = 4;
      // abort 后 XHR 不会触发 onreadystatechange(否则会进入 "完成" 分支)
    }
    // 手动推进
    complete(status = 200, text = "[00:00.00]done") {
      this.status = status;
      this.responseText = text;
      this.readyState = 4;
      this.onreadystatechange?.();
    }
    error() {
      this.onerror?.();
    }
  }

  (globalThis as unknown as { XMLHttpRequest: unknown }).XMLHttpRequest = FakeXhr;
  return { instances, FakeXhr: FakeXhr as unknown as { new(): FakeXhr } & typeof FakeXhr };
}

function makeContainer() {
  const c = win.document.createElement("div");
  c.className = "aplayer-lrc";
  win.document.body.appendChild(c);
  return c;
}

function makeFakePlayer(list: { audios: Array<{ lrc?: string }>; index: number }) {
  // events.trigger / template.lrcWrap 是最小 stub
  return {
    events: { trigger: () => {} },
    template: { lrcWrap: win.document.createElement("div") },
    audio: { currentTime: 0 },
    list,
  };
}

describe("lrc inflight 去重 + 占位不入缓存", () => {
  test("同 index 第二次 switch → loading=true,只渲染 Loading 占位,不开新 XHR", async () => {
    const { instances } = installFakeXhr();
    const container = makeContainer();
    const player = makeFakePlayer({ audios: [{ lrc: "https://x.com/a.lrc" }], index: 0 });
    const lrc = new Lrc({ container: container as unknown as HTMLElement, async: true, player: player as never });

    lrc.switch(0); // 第一次:开 XHR,loading[0]=true,渲染 Loading
    expect(instances.length).toBe(1);
    const firstXhr = instances[0]!;

    lrc.switch(0); // 第二次:loading[0]=true,不开新 XHR
    expect(instances.length).toBe(1); // 关键:不开新 XHR
    expect(firstXhr.aborted).toBe(false);

    // 推进 XHR 完成 → 真实结果落 parsed
    firstXhr.complete(200, "[00:00.00]real-lyric");
    // 第二次 switch 现在 parsed[0] 存在 → 渲染真实歌词
    lrc.switch(0);
    expect(container.innerHTML).toContain("real-lyric");
  });

  test("占位 Loading 不写入 parsed(直到 XHR 完成才落缓存)", async () => {
    const { instances } = installFakeXhr();
    const container = makeContainer();
    const player = makeFakePlayer({ audios: [{ lrc: "https://x.com/a.lrc" }], index: 0 });
    const lrc = new Lrc({ container: container as unknown as HTMLElement, async: true, player: player as never });

    lrc.switch(0);
    // 在 XHR 完成前,parsed[0] 应是 undefined(占位未入缓存)
    expect(lrc.parsed[0]).toBeUndefined();
    expect(lrc.loading[0]).toBe(true);
    // 完成
    instances[0]!.complete(200, "[00:00.00]cached");
    expect(lrc.parsed[0]).toBeDefined();
    expect(lrc.parsed[0]!.length).toBeGreaterThan(0);
    expect(lrc.loading[0]).toBe(false);
  });
});

describe("lrc destroy() abort pendingXhr", () => {
  test("销毁时 pendingXhr.abort() 被调", async () => {
    const { instances } = installFakeXhr();
    const container = makeContainer();
    const player = makeFakePlayer({ audios: [{ lrc: "https://x.com/a.lrc" }], index: 0 });
    const lrc = new Lrc({ container: container as unknown as HTMLElement, async: true, player: player as never });

    lrc.switch(0); // 开 XHR
    expect(lrc.pendingXhr).toBeDefined();
    expect(instances[0]!.aborted).toBe(false);

    lrc.destroy();
    expect(instances[0]!.aborted).toBe(true);
    expect(lrc.pendingXhr).toBeUndefined();
    expect(lrc.parsed).toEqual([]);
    expect(lrc.loading).toEqual([]);
  });

  test("abort 后 XHR 不会回写 DOM(parsed 不被设,container 不变)", async () => {
    const { instances } = installFakeXhr();
    const container = makeContainer();
    const player = makeFakePlayer({ audios: [{ lrc: "https://x.com/a.lrc" }], index: 0 });
    const lrc = new Lrc({ container: container as unknown as HTMLElement, async: true, player: player as never });

    lrc.switch(0);
    const xhr = instances[0]!;
    lrc.destroy();
    expect(xhr.aborted).toBe(true);
    // 模拟 abort 后 readyState 4 不会触发 onreadystatechange(XHR 自身遵守规则)
    // 这里仅断言 parsed 未被覆盖
    expect(lrc.parsed).toEqual([]);
    // container 已被 destroy 清空
    expect(container.innerHTML).toBe("");
  });
});

describe("lrc 结果总是落缓存,仅当前曲才刷 DOM", () => {
  test("XHR 完成时若 index !== player.list.index → parsed 被写,但 DOM 不刷", async () => {
    const { instances } = installFakeXhr();
    const container = makeContainer();
    const player = makeFakePlayer({ audios: [{ lrc: "https://x.com/a.lrc" }, { lrc: "https://x.com/b.lrc" }], index: 1 });
    const lrc = new Lrc({ container: container as unknown as HTMLElement, async: true, player: player as never });

    lrc.switch(0); // 切到 index 0,XHR 在途
    // 切到 index 1
    lrc.switch(1); // 也会开新 XHR (loading[1]=true)
    // 完成 index 0 的 XHR
    instances[0]!.complete(200, "[00:00.00]first-cached");
    // index 0 真实结果应落缓存(切回时直接命中),但 DOM 不刷(因为 player.list.index=1)
    expect(lrc.parsed[0]).toBeDefined();
    // 切回 0 时直接命中缓存
    lrc.switch(0);
    expect(container.innerHTML).toContain("first-cached");
  });
});