import { describe, expect, test } from "bun:test";

import { usePlayerManager } from "~/composables/usePlayerManager";

describe("usePlayerManager", () => {
  test("从 useNuxtApp().$playerManager 读取播放器管理器", () => {
    // setup-composable-globals 提供了 useNuxtApp stub,默认返回 { isHydrating: false, payload: {} }
    // → $playerManager 是 undefined
    const manager = usePlayerManager();
    expect(manager).toBeUndefined();
  });

  test("多次调用均读取同一份(随 useNuxtApp 的 ref 变化)", () => {
    const a = usePlayerManager();
    const b = usePlayerManager();
    // useNuxtApp 每次返回新对象,但 $playerManager 字段值应一致(undefined)
    expect(a).toBe(b);
  });

  test("注入 $playerManager 后可读到实例", () => {
    const fakeManager = {
      registerPlayer: () => {},
      unregisterPlayer: () => {},
      notifyPlay: () => {},
    };
    const origNuxt = (globalThis as Record<string, unknown>).useNuxtApp;
    (globalThis as Record<string, unknown>).useNuxtApp = () => ({
      isHydrating: false,
      payload: {},
      $playerManager: fakeManager,
    });
    try {
      expect(usePlayerManager()).toBe(fakeManager);
    } finally {
      (globalThis as Record<string, unknown>).useNuxtApp = origNuxt;
    }
  });
});