import { describe, expect, test } from "bun:test";

// 注:useScrollRaf 核心行为受 `if (import.meta.client)` 守卫;bun:test 环境 client 为
// undefined(模块级 Vite 编译期常量,无法在测试改,见
// .claude/memory/composable-test-happy-dom-effectscope.md)。本文件仅锁定**测试环境下
// 观察到的合约**:不订阅、不挂监听,SSR/客户端 isHydrating 时不挂起,以免无谓耦合。
//
// 真实 scroll → rAF → 同步读 scrollY/innerHeight → 分发的行为靠 dev 手工验证 +
// 后文 useMarkdownContent 中代码块复制/折叠展开的 e2e 流程覆盖。

import { useFadeOutOnNavigate } from "~/composables/useFadeOutOnNavigate"; // sibling 演示 import 路径
import { useScrollRaf } from "~/composables/useScrollRaf";

describe("useScrollRaf (bun:test 环境 import.meta.client=false)", () => {
  test("调用不抛、返回 void(订阅走 import.meta.client 守卫,SSR/测试环境下是空操作)", () => {
    expect(() => useScrollRaf(() => {})).not.toThrow();
  });

  test("SSR/测试环境 import.meta.server 同样为 false,useFadeOutOnNavigate 不挂起 → 立即 resolve", async () => {
    // 引用 useFadeOutOnNavigate 锁定它在非 client 路径下不挂起 fadeDuration
    // (避免被人加 client 守卫后 SSR 多等 N ms → TTFB 退化)
    const start = Date.now();
    await useFadeOutOnNavigate();
    const elapsed = Date.now() - start;
    expect(elapsed).toBeLessThan(50); // 不应等 fadeDuration(默认 ~200ms)
  });
});