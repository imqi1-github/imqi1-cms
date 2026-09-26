import { afterEach, beforeEach, describe, expect, test } from "bun:test";
import { Window } from "happy-dom";

import { useMarkdownContent } from "~/composables/useMarkdownContent";

// 注:useMarkdownContent.mount() 走 `if (!import.meta.client)` 守卫;bun:test 环境
// client=undefined 模块级常量无法在测试改(见 .claude/memory/composable-test-happy-dom-effectscope.md)。
// 真实 mount 路径(代码块复制/折叠/语言标签注入、9 类 markdown 容器挂载、表格转置、
// 实况照片兼容、<style id="markdown-widget-styles"> 幂等)靠 dev 手工验证 +
// 后续文章详情页 e2e 流程覆盖。本文件锁定:
//   1. mount/cleanup 返回形状;
//   2. cleanup 在测试环境(无 DOM 修改)安全调用不抛(它会跑 querySelectorAll
//      → empty NodeList → forEach 跳过)。

let win: Window;

beforeEach(() => {
  win = new Window();
  Object.assign(globalThis, {
    window: win,
    document: win.document,
    HTMLElement: win.HTMLElement,
  });
});

afterEach(() => {
  win.close();
});

describe("useMarkdownContent 合约", () => {
  test("返回 { mount, cleanup } 两个函数", () => {
    const { mount, cleanup } = useMarkdownContent({ findImageDimensions: () => null });
    expect(typeof mount).toBe("function");
    expect(typeof cleanup).toBe("function");
  });

  test("mount/cleanup 调用不抛(测试环境 client=false → mount 是空操作,cleanup 是空 querySelectorAll)", () => {
    const { mount, cleanup } = useMarkdownContent({ findImageDimensions: () => null });
    expect(() => mount()).not.toThrow();
    expect(() => cleanup()).not.toThrow();
    // 重复 mount/cleanup 也安全
    expect(() => mount()).not.toThrow();
    expect(() => cleanup()).not.toThrow();
  });

  test("cleanup 在 DOM 有内容时也可调用(空 querySelectorAll + 空 forEach)", () => {
    // 模拟文章详情页 SSR 输出:挂几个复制按钮/语言标签占位元素(虽然 mount 未跑,
    // 但 cleanup 假设它们在 → 走 querySelectorAll)。本仓库 cleanup 用 cloneNode
    // 替换以移除监听器,空 NodeList 下 forEach 跳过即等于 no-op。
    const pre = win.document.createElement("pre");
    pre.className = "shiki language-js";
    const btn = win.document.createElement("button");
    btn.className = "copy-button";
    pre.appendChild(btn);
    win.document.body.appendChild(pre);

    const { cleanup } = useMarkdownContent({ findImageDimensions: () => null });
    expect(() => cleanup()).not.toThrow();
    // cleanup 没真跑(客户端守卫外的 DOM 操作在 useMarkdownTableTranspose 之后,
    // 而后者 client=false → 提前 return;但 querySelectorAll/.forEach 仍执行)。
    // 文档里按钮可能被替换(空 NodeList 下不动)→ 断言按钮依然存在即代表安全。
    expect(win.document.querySelector(".copy-button")).not.toBeNull();
  });
});