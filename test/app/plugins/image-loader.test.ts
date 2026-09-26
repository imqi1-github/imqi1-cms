import { describe, expect, test } from "bun:test";

(globalThis as Record<string, unknown>).defineNuxtPlugin = <T>(fn: (nuxtApp: T) => unknown) => fn;

const { default: imageLoaderPlugin } = await import("~/plugins/image-loader.client");

// 注:image-loader 整个函数体在 import.meta.client 守卫内,bun:test 下不会真正跑 wrap/markLoading 等。
// 我们只验 plugin import 不抛 + 调用 callback 不抛(被 import.meta.client 守门直接 return)。

describe("image-loader plugin", () => {
  test("plugin 模块 import 不抛", () => {
    expect(typeof imageLoaderPlugin).toBe("function");
  });

  test("plugin callback 调用不抛(import.meta.client=false 时守门 return)", () => {
    expect(() => imageLoaderPlugin({} as never, {} as never)).not.toThrow();
  });
});