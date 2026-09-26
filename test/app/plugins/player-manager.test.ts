import { beforeEach, describe, expect, mock, test } from "bun:test";

// #app 是 Nuxt 别名,bun:test 不识别。plugin 用了 defineNuxtPlugin + ref,
// 我们用最小 stub 替换 #app 模块。mock.module 必须在 dynamic import 之前注册。
mock.module("#app", () => ({
  defineNuxtPlugin: <T>(fn: (nuxtApp: T) => unknown) => fn,
  ref: <T>(v: T) => ({ value: v }),
}));

const { default: playerManagerPlugin, PLAYER_MANAGER_KEY } = await import(
  "~/plugins/player-manager.client"
);

interface PlayerManagerStub {
  registerPlayer: (type: "footer" | "meting", id: string, pause: () => void) => void;
  unregisterPlayer: (type: "footer" | "meting", id: string) => void;
  notifyPlay: (type: "footer" | "meting", id: string) => void;
}

function loadManager(): PlayerManagerStub {
  const provided: Record<string, unknown> = {};
  const fakeNuxtApp = {
    provide(key: string, value: unknown) {
      provided[key] = value;
    },
  };
  playerManagerPlugin(fakeNuxtApp as never, {} as never);
  return provided[PLAYER_MANAGER_KEY] as PlayerManagerStub;
}

describe("player-manager plugin", () => {
  let manager: PlayerManagerStub;

  beforeEach(() => {
    manager = loadManager();
  });

  test("provide 注册到 PLAYER_MANAGER_KEY", () => {
    expect(typeof manager).toBe("object");
    expect(typeof manager.registerPlayer).toBe("function");
    expect(typeof manager.unregisterPlayer).toBe("function");
    expect(typeof manager.notifyPlay).toBe("function");
  });

  test("registerPlayer + unregisterPlayer 同 id → 注销后该 id 不再被 notifyPlay 调用", () => {
    let paused = 0;
    manager.registerPlayer("footer", "p1", () => { paused++; });
    manager.unregisterPlayer("footer", "p1");
    manager.notifyPlay("meting", "m1");
    expect(paused).toBe(0);
  });

  test("notifyPlay 暂停同类型其它播放器(不影响自己)", () => {
    let p1 = 0;
    let p2 = 0;
    manager.registerPlayer("footer", "p1", () => { p1++; });
    manager.registerPlayer("footer", "p2", () => { p2++; });
    manager.notifyPlay("footer", "p1");
    expect(p1).toBe(0);
    expect(p2).toBe(1);
  });

  test("notifyPlay 暂停所有其它类型的所有播放器", () => {
    let footerPaused = 0;
    let metingPaused = 0;
    manager.registerPlayer("footer", "f1", () => { footerPaused++; });
    manager.registerPlayer("meting", "m1", () => { metingPaused++; });
    manager.registerPlayer("meting", "m2", () => { metingPaused++; });
    manager.notifyPlay("footer", "f1");
    expect(footerPaused).toBe(0);
    expect(metingPaused).toBe(2);
  });

  test("单个 pause 抛错不影响其它 player(try/catch 容错)", () => {
    const calls: string[] = [];
    manager.registerPlayer("footer", "bad", () => { throw new Error("boom"); });
    manager.registerPlayer("footer", "good", () => { calls.push("good"); });
    const origErr = console.error;
    console.error = () => {};
    try {
      manager.notifyPlay("footer", "x");
      expect(calls).toEqual(["good"]);
    } finally {
      console.error = origErr;
    }
  });

  test("register 重复 id → 覆盖(同一 id 多次注册只保留最后一次的 pause)", () => {
    let first = 0;
    let second = 0;
    manager.registerPlayer("footer", "p1", () => { first++; });
    manager.registerPlayer("footer", "p1", () => { second++; });
    manager.notifyPlay("meting", "m1");
    expect(first).toBe(0);
    expect(second).toBe(1);
  });

  test("unregister 未注册的 id → 不抛", () => {
    expect(() => manager.unregisterPlayer("footer", "nope")).not.toThrow();
  });

  test("notifyPlay 时无任何注册 → 不抛", () => {
    expect(() => manager.notifyPlay("footer", "any")).not.toThrow();
    expect(() => manager.notifyPlay("meting", "any")).not.toThrow();
  });
});