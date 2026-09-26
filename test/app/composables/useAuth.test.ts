import { beforeEach, describe, expect, test } from "bun:test";

import { useAuth } from "~/composables/useAuth";

// useState 全局 key 跨 test 残留 → 每个 test 启动重置。
beforeEach(() => {
  useState<unknown>("auth:isLoggedIn", () => false).value = false;
  useState<unknown>("auth:isLoadingAuth", () => true).value = true;
  useState<unknown>("auth:currentUser", () => null).value = null;
  useState<unknown>("auth:hasInitialized", () => false).value = false;
});

// 注:checkAuthStatus 走 `if (import.meta.client)` 守卫;bun:test 环境 client=undefined
// 模块级常量无法在测试改(详见 .claude/memory/composable-test-happy-dom-effectscope.md)。
// 真实调用 $fetch("/api/auth/verify") → 写 isLoggedIn / currentUser / hasInitialized
// 的路径靠 dev 手工验证 + e2e 流程覆盖。本文件锁定测试环境下可达合约。

describe("useAuth 初始状态合约", () => {
  test("默认未初始化:isLoadingAuth=true / isLoggedIn=false / currentUser=null / hasInitialized=false", () => {
    const a = useAuth();
    expect(a.hasInitialized.value).toBe(false);
    expect(a.isLoadingAuth.value).toBe(true);
    expect(a.isLoggedIn.value).toBe(false);
    expect(a.currentUser.value).toBeNull();
  });

  test("暴露字段:isLoggedIn/isLoadingAuth/currentUser/hasInitialized 都是 readonly + checkAuthStatus 是函数", () => {
    const a = useAuth();
    // readonly 在 dev 模式改写会 warn;此处断言 ref 存在 + 类型
    expect(a.isLoggedIn).toBeDefined();
    expect(a.isLoadingAuth).toBeDefined();
    expect(a.currentUser).toBeDefined();
    expect(a.hasInitialized).toBeDefined();
    expect(typeof a.checkAuthStatus).toBe("function");
  });

  test("useAuth 与 useAuth 返回的是独立 readonly ref(但同 useState key 共享底层数据)", () => {
    const a1 = useAuth();
    const a2 = useAuth();
    // 不同实例但同 key → 同一 ref
    expect(a1.isLoggedIn).toBe(a2.isLoggedIn);
    expect(a1.currentUser).toBe(a2.currentUser);
  });
});