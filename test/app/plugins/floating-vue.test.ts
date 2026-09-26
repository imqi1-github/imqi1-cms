import { describe, expect, test } from "bun:test";

(globalThis as Record<string, unknown>).defineNuxtPlugin = <T>(fn: (nuxtApp: T) => unknown) => fn;

// 注:floating-vue plugin 主体(client 分支)被 import.meta.client 守卫,
// bun:test 触发不到真分支。Mocking floating-vue 包会污染后续模块加载,
// 按 zz-late 约定不写集成测试,只验 plugin import + 调用不抛。

const { default: floatingVuePlugin } = await import("~/plugins/floating-vue");

describe("floating-vue plugin", () => {
  test("plugin 不抛(import.meta.client=false 走 SSR 分支)", () => {
    expect(() => floatingVuePlugin({ vueApp: {} } as never, {} as never)).not.toThrow();
  });
});