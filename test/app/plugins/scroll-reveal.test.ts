import { describe, expect, test } from "bun:test";

// scroll-reveal plugin:注册全局指令 scroll-reveal,SSR 也会跑。
(globalThis as Record<string, unknown>).defineNuxtPlugin = <T>(fn: (nuxtApp: T) => unknown) => fn;

const { default: scrollRevealPlugin } = await import("~/plugins/scroll-reveal");

describe("scroll-reveal plugin", () => {
  test("向 vueApp 注册名为 'scroll-reveal' 的指令", () => {
    const registered: Array<{ name: string; def: unknown }> = [];
    const fakeNuxtApp = {
      vueApp: {
        directive(name: string, def: unknown) {
          registered.push({ name, def });
        },
      },
    };
    scrollRevealPlugin(fakeNuxtApp as never, {} as never);
    expect(registered).toHaveLength(1);
    expect(registered[0]?.name).toBe("scroll-reveal");
  });

  test("注册的指令是 scrollRevealDirective(对象,非 undefined)", () => {
    let directiveDef: unknown;
    const fakeNuxtApp = {
      vueApp: {
        directive(_name: string, def: unknown) {
          directiveDef = def;
        },
      },
    };
    scrollRevealPlugin(fakeNuxtApp as never, {} as never);
    expect(directiveDef).toBeDefined();
    expect(typeof directiveDef).toBe("object");
  });
});