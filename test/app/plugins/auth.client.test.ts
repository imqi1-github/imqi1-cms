import { afterEach, describe, expect, test } from "bun:test";

// auth.client plugin:provide.$isLogin = useAuth().isLoggedIn.value
// 依赖 useAuth() 自动导入,我们 stub 注入
(globalThis as Record<string, unknown>).defineNuxtPlugin = <T>(fn: (nuxtApp: T) => unknown) => fn;

const { default: authClientPlugin } = await import("~/plugins/auth.client");

let origUseAuth: unknown;
afterEach(() => {
  if (origUseAuth !== undefined) {
    (globalThis as Record<string, unknown>).useAuth = origUseAuth;
  } else {
    delete (globalThis as Record<string, unknown>).useAuth;
  }
  origUseAuth = undefined;
});

describe("auth.client plugin", () => {
  function runWithIsLoggedIn(value: boolean): { isLogin?: () => boolean } {
    origUseAuth = (globalThis as Record<string, unknown>).useAuth;
    (globalThis as Record<string, unknown>).useAuth = () => ({
      isLoggedIn: { value },
    });
    const fakeNuxtApp = { provide: () => {} };
    const result = authClientPlugin(fakeNuxtApp as never, {} as never) as
      | { provide?: { isLogin?: () => boolean } }
      | undefined;
    return result?.provide ?? {};
  }

  test("provide.isLogin 函数返回 useAuth().isLoggedIn.value=true", () => {
    const { isLogin } = runWithIsLoggedIn(true);
    expect(typeof isLogin).toBe("function");
    expect(isLogin!()).toBe(true);
  });

  test("useAuth().isLoggedIn.value=false → isLogin() 返回 false", () => {
    const { isLogin } = runWithIsLoggedIn(false);
    expect(isLogin!()).toBe(false);
  });
});