/**
 * useScrollbarTheme: 根据 colorMode 切滚动条颜色 CSS 变量
 *  - dark 注入的 style.textContent 含 "#475569" 暗色 thumb
 *  - light 含 "#cbd5e1" 亮色 thumb
 *  - 切换模式时旧 <style id="scrollbar-theme-style"> 被替换为新
 *  - SSR(client=false) 不动 DOM
 */
import { readFileSync } from "node:fs";

import { afterEach, beforeAll, beforeEach, describe, expect, test } from "bun:test";
import { ref } from "vue";
import { Window } from "happy-dom";

const g = globalThis as Record<string, unknown>;
let colorModeRef: { value: string };

beforeAll(() => {
  (Bun as unknown as { plugin: (p: unknown) => void }).plugin({
    name: "scrollbar-theme-meta-switcher",
    setup(build: { onLoad: (opts: { filter: RegExp }, fn: (a: { path: string }) => { contents: string; loader: string } | undefined) => void }) {
      build.onLoad({ filter: /useScrollbarTheme\.ts$/ }, (args) => {
        let src = readFileSync(args.path, "utf8");
        src = src.replace(/import\.meta\.client/g, "(__testAsClient)");
        return { contents: src, loader: "ts" };
      });
    },
  });
});

let win: Window;
beforeEach(() => {
  win = new Window();
  g.__testAsClient = true;
  colorModeRef = ref<string>("dark");
  g.useColorMode = () => colorModeRef;
  Object.assign(globalThis, {
    window: win,
    document: win.document,
    HTMLElement: win.HTMLElement,
  });
});
afterEach(() => {
  win.close();
  g.__testAsClient = false;
  delete g.useColorMode;
});

function getStyleEl(): HTMLStyleElement | null {
  return win.document.getElementById("scrollbar-theme-style") as HTMLStyleElement | null;
}

describe("useScrollbarTheme", () => {
  test("dark 模式:注入 style 含 #475569 暗色 thumb", async () => {
    colorModeRef.value = "dark";
    const { useScrollbarTheme } = await import("~/composables/useScrollbarTheme");
    useScrollbarTheme();
    await new Promise<void>((r) => setTimeout(r, 0));
    const el = getStyleEl();
    expect(el).not.toBeNull();
    expect(el!.textContent).toContain("#475569");
    expect(el!.textContent).toContain("#1e293b");
  });

  test("light 模式:注入 style 含 #cbd5e1 亮色 thumb", async () => {
    colorModeRef.value = "light";
    const { useScrollbarTheme } = await import("~/composables/useScrollbarTheme");
    useScrollbarTheme();
    await new Promise<void>((r) => setTimeout(r, 0));
    const el = getStyleEl();
    expect(el).not.toBeNull();
    expect(el!.textContent).toContain("#cbd5e1");
    expect(el!.textContent).toContain("#f1f5f9");
  });

  test("切换 dark → light:旧 style 被替换为新(textContent 不同)", async () => {
    colorModeRef.value = "dark";
    const { useScrollbarTheme } = await import("~/composables/useScrollbarTheme");
    useScrollbarTheme();
    await new Promise<void>((r) => setTimeout(r, 0));
    const darkEl = getStyleEl();
    expect(darkEl!.textContent).toContain("#475569");

    colorModeRef.value = "light";
    await new Promise<void>((r) => setTimeout(r, 0));
    const lightEl = getStyleEl();
    expect(lightEl).not.toBeNull();
    expect(lightEl!.id).toBe("scrollbar-theme-style");
    expect(lightEl!.textContent).toContain("#cbd5e1");
    // DOM 中始终只有一个 scrollbar-theme-style(旧的被移除)
    expect(win.document.querySelectorAll("#scrollbar-theme-style")).toHaveLength(1);
  });

  test("存在 scrollbar-theme-init 时也被一并清理", async () => {
    colorModeRef.value = "light";
    const initStyle = win.document.createElement("style");
    initStyle.id = "scrollbar-theme-init";
    initStyle.textContent = "/* init */";
    win.document.head.appendChild(initStyle);

    const { useScrollbarTheme } = await import("~/composables/useScrollbarTheme");
    useScrollbarTheme();
    await new Promise<void>((r) => setTimeout(r, 0));
    expect(win.document.getElementById("scrollbar-theme-init")).toBeNull();
    expect(getStyleEl()).not.toBeNull();
  });

  test("SSR (client=false):不动 DOM、不创建 style", async () => {
    g.__testAsClient = false;
    colorModeRef.value = "dark";
    const { useScrollbarTheme } = await import("~/composables/useScrollbarTheme");
    useScrollbarTheme();
    await new Promise<void>((r) => setTimeout(r, 0));
    expect(getStyleEl()).toBeNull();
  });
});