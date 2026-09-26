import { describe, expect, test } from "bun:test";

import { useFadeOutOnNavigate } from "~/composables/useFadeOutOnNavigate";

// 注:line 20 的 `if (import.meta.client && !nuxtApp.isHydrating)` 真分支(挂起 fadeDuration)
// 在 bun:test 不可达 —— import.meta.client 是模块级 Vite 编译期常量(见
// .claude/memory/composable-test-happy-dom-effectscope.md),bun 环境恒为 undefined。
// 此处锁定:**测试环境(SSR 守卫 / 测试均非 client)→ 立即 resolve,不应等 fadeDuration**。
// 真实挂起行为靠 dev 手工验证 + 后续 useNotFoundPage / 404 页 e2e 流程覆盖。

describe("useFadeOutOnNavigate", () => {
  test("import.meta.client=false(测试/SSR)→ 立即 resolve,不应挂起 fadeDuration", async () => {
    const start = Date.now();
    const p = useFadeOutOnNavigate();
    expect(p).toBeInstanceOf(Promise);
    await p;
    const elapsed = Date.now() - start;
    // siteConfig.pages.transition.fadeDuration 默认 200ms;远小于此阈值说明没等
    expect(elapsed).toBeLessThan(50);
  });

  test("调用稳定:连续调用多次都立即 resolve(无内部副作用)", async () => {
    for (let i = 0; i < 5; i++) {
      const start = Date.now();
      await useFadeOutOnNavigate();
      expect(Date.now() - start).toBeLessThan(50);
    }
  });
});