/**
 * auth.global middleware：admin 路由 SSR/C端拦截 + 跳 /login?to=fullPath
 * 覆盖三件事:
 *  1) 非 admin 路径不拦截
 *  2) 服务端: getUser 返 user → 放行；返 null/抛错 → 跳登录
 *  3) 客户端: $fetch /api/auth/verify 返 {valid:true} → 放行；其余 → 跳登录
 *  4) 关键不变式: 回跳 query.to 用 to.fullPath(保留 query/hash),不是 to.path
 */
import { readFileSync } from "node:fs";

import { afterEach, beforeAll, beforeEach, describe, expect, mock, test } from "bun:test";

// import.meta.server / client 是构建期常量 → 用 Bun.plugin 改写为 globalThis 可变量。
// 只接管 app/middleware/auth.global.ts,不影响其它源码/测试。
// defineNuxtRouteMiddleware 是 Nuxt 自动注入 globalThis 的全局函数(非 #app 导出),
// 必须在 import 前 stub,否则顶层 evaluate 即 ReferenceError。
(globalThis as Record<string, unknown>).defineNuxtRouteMiddleware = <T>(fn: (to: T) => unknown) => fn;

beforeAll(() => {
   
  (Bun as unknown as { plugin: (p: unknown) => void }).plugin({
    name: "auth-global-meta-switcher",
    setup(build: { onLoad: (opts: { filter: RegExp }, fn: (a: { path: string }) => { contents: string; loader: string } | undefined) => void }) {
      build.onLoad({ filter: /auth\.global\.ts$/ }, (args) => {
        let src = readFileSync(args.path, "utf8");
        src = src.replace(/import\.meta\.server/g, "(__testAsServer)");
        src = src.replace(/import\.meta\.client/g, "(__testAsClient)");
        return { contents: src, loader: "ts" };
      });
    },
  });
});

// mock.module 在 import 前注册一次,后续通过 globalThis 上的可变函数改实现,
// 避免 mock.module 不可撤销导致 test 间互相覆盖。
// Nuxt 把 defineNuxtRouteMiddleware / useRequestEvent / navigateTo / $fetch 自动注入
// globalThis(非 #app 导出),middleware 直接全局引用 → 这里改写 globalThis。
function installStubs(): void {
  const g = globalThis as Record<string, unknown>;
  g.__testNavCalls = [];
  g.__testFetchCalls = [];
  g.__testAsServer = false;
  g.__testAsClient = false;
  g.__testEvent = {};
  g.__testGetUserImpl = async () => null;
  g.__testFetchImpl = async () => ({ valid: true });

  g.defineNuxtRouteMiddleware = <T>(fn: (to: T) => unknown) => fn;
  g.useRequestEvent = () => g.__testEvent;
  g.navigateTo = async (to: unknown) => {
    (g.__testNavCalls as unknown[]).push(to);
    return undefined;
  };
  g.$fetch = async (url: string) => {
    (g.__testFetchCalls as string[]).push(url);
    return (g.__testFetchImpl as (u: string) => Promise<unknown>)(url);
  };

  // getUser 走 await import("#server/lib/auth"),需要 mock.module 替换
  mock.module("#server/lib/auth", () => ({
    getUser: async (event: unknown) =>
      (g.__testGetUserImpl as (e: unknown) => Promise<unknown>)(event),
  }));
}

const g = globalThis as Record<string, unknown>;

let auth: (to: { path: string; fullPath: string }) => Promise<unknown>;

beforeAll(async () => {
  installStubs();
  const mod = await import("~/middleware/auth.global");
  auth = mod.default;
});

beforeEach(() => {
  g.__testAsServer = false;
  g.__testAsClient = false;
  g.__testEvent = {};
  (g.__testNavCalls as unknown[]).length = 0;
  (g.__testFetchCalls as string[]).length = 0;
  g.__testGetUserImpl = async () => null;
  g.__testFetchImpl = async () => ({ valid: true });
});

afterEach(() => {
  // 切回 server=true 时(默认),把 client 设为 false 互斥
  if (g.__testAsServer === true) g.__testAsClient = false;
});

function setServer(): void { g.__testAsServer = true; g.__testAsClient = false; }
function setClient(): void { g.__testAsServer = false; g.__testAsClient = true; }

describe("auth.global middleware", () => {
  test("非 admin 路径:server / client 都不调 navigateTo、不调 getUser/$fetch", async () => {
    setServer();
    await auth({ path: "/", fullPath: "/" });
    await auth({ path: "/posts", fullPath: "/posts?tag=x" });
    await auth({ path: "/blog/2024/post", fullPath: "/blog/2024/post?from=index" });
    expect(g.__testNavCalls).toEqual([]);
    expect(g.__testFetchCalls).toEqual([]);
    setClient();
    // "/blog/2024" 与 "/login" 都是非 admin 路径,client 分支也应跳过
    await auth({ path: "/blog/2024/post", fullPath: "/blog/2024/post" });
    await auth({ path: "/login", fullPath: "/login?to=/x" });
    expect(g.__testFetchCalls).toEqual([]);
    expect(g.__testNavCalls).toEqual([]);
  });

  test("admin + server + getUser 返 user → 不跳", async () => {
    setServer();
    g.__testGetUserImpl = async () => ({ uid: 1, name: "admin" });
    const result = await auth({ path: "/admin/posts", fullPath: "/admin/posts" });
    expect(result).toBeUndefined();
    expect(g.__testNavCalls).toEqual([]);
  });

  test("admin + server + getUser 返 null → navigateTo /login?to=fullPath", async () => {
    setServer();
    g.__testGetUserImpl = async () => null;
    await auth({ path: "/admin/x", fullPath: "/admin/x?tab=info" });
    expect(g.__testNavCalls).toEqual([
      { path: "/login", query: { to: "/admin/x?tab=info" } },
    ]);
  });

  test("admin + server + 无 event(null) → 兜底 navigateTo", async () => {
    setServer();
    g.__testEvent = null;
    await auth({ path: "/admin/x", fullPath: "/admin/x" });
    expect(g.__testNavCalls).toEqual([
      { path: "/login", query: { to: "/admin/x" } },
    ]);
  });

  test("admin + server + getUser 抛错 → catch 兜底 navigateTo", async () => {
    setServer();
    g.__testGetUserImpl = async () => { throw new Error("session store down"); };
    await auth({ path: "/admin/x", fullPath: "/admin/x" });
    expect(g.__testNavCalls).toEqual([
      { path: "/login", query: { to: "/admin/x" } },
    ]);
  });

  test("admin + client + $fetch.valid=true → 不跳、调用一次 /api/auth/verify", async () => {
    setClient();
    g.__testFetchImpl = async () => ({ valid: true });
    const result = await auth({ path: "/admin/x", fullPath: "/admin/x" });
    expect(result).toBeUndefined();
    expect(g.__testNavCalls).toEqual([]);
    expect(g.__testFetchCalls).toEqual(["/api/auth/verify"]);
  });

  test("admin + client + $fetch.valid=false → navigateTo /login?to=fullPath", async () => {
    setClient();
    g.__testFetchImpl = async () => ({ valid: false });
    await auth({ path: "/admin/x", fullPath: "/admin/x?q=1" });
    expect(g.__testNavCalls).toEqual([
      { path: "/login", query: { to: "/admin/x?q=1" } },
    ]);
    expect(g.__testFetchCalls).toEqual(["/api/auth/verify"]);
  });

  test("admin + client + $fetch 抛错 → 兜底 navigateTo", async () => {
    setClient();
    g.__testFetchImpl = async () => { throw new Error("network"); };
    await auth({ path: "/admin/x", fullPath: "/admin/x" });
    expect(g.__testNavCalls).toEqual([
      { path: "/login", query: { to: "/admin/x" } },
    ]);
  });

  test("关键不变式:回跳 query.to = to.fullPath(保留 query/hash),不是 to.path", async () => {
    setClient();
    g.__testFetchImpl = async () => ({ valid: false });
    // 模拟 [slug].vue:to.path = "/admin/posts/123",to.fullPath = "/admin/posts/123?cid=42&tab=edit"
    await auth({
      path: "/admin/posts/123",
      fullPath: "/admin/posts/123?cid=42&tab=edit",
    });
    const nav = (g.__testNavCalls as Array<{ path: string; query: Record<string, string> }>)[0];
    expect(nav.path).toBe("/login");
    expect(nav.query.to).toBe("/admin/posts/123?cid=42&tab=edit");
    // 反向断言:不是 path
    expect(nav.query.to).not.toBe("/admin/posts/123");
  });
});