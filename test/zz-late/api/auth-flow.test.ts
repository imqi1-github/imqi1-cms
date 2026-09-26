import { describe, expect, mock, test } from "bun:test";

import { CSRF_TOKEN, callAdmin, loginSessionCookie } from "#test/helpers/admin";
import { CSRF_HEADER } from "#shared/constants";
import { mockSharedPrisma, sharedFake } from "#test/helpers/fake-prisma";

// mock session-store:让 setSession + getUser 共享 session(真实 store 是 file,跨 process 不可靠)
// 关键:__memStore 必须在 globalThis 上,否则每个 test file 启动时新建(因 module 顶层 const 重 evaluate),
// 跨文件 setSession 写入的 session 在跨文件 getUser 时读不到。
const g = globalThis as unknown as { __authFlowMemStore?: Map<string, unknown> };
if (!g.__authFlowMemStore) g.__authFlowMemStore = new Map();
const memStore = g.__authFlowMemStore;
mock.module("#server/utils/session-store", () => ({
  getSessionStore: async () => ({
    async get(id: string) {
      if (!memStore.has(id)) return null;
      const s = memStore.get(id) as { expires: number };
      if (Date.now() < s.expires) return s;
      memStore.delete(id);
      return null;
    },
    async set(id: string, data: unknown) { memStore.set(id, data); },
    async delete(id: string) { memStore.delete(id); },
    async clearUserSessions() {},
    async cleanup() {},
  }),
  getSessionConfig: async () => ({ storeType: "memory" as const }),
  MemorySessionStore: { prototype: {} } as unknown as { new (): unknown },
  FileSessionStore: { prototype: {} } as unknown as { new (): unknown },
  DatabaseSessionStore: { prototype: {} } as unknown as { new (): unknown },
}));

mockSharedPrisma();

// users 表假件:复用 helper/auth-fakes.registerAuthFakes 的 users handler(registerAuthFakes
// 在 import #test/helpers/admin 时已注册)。它支持 select 投影,不暴露 auth_code 给公开接口。
// 仅补 count 与 sessionStoreType metadata(registerAuthFakes 已注册 informations 但只覆盖
// sessionStoreType / commentAvatarService / 其他,缺少就兜底返回 null)
sharedFake.on("users", "count", async () => 1);

const loginConfigHandler = (await import("#server/api/auth/login-config.get")).default;
const logoutHandler = (await import("#server/api/auth/logout.post")).default;
const meHandler = (await import("#server/api/auth/me.get")).default;
const verifyHandler = (await import("#server/api/auth/verify.get")).default;

describe("auth/login-config.get(登录页配置探针)", () => {
  test("返回 captchaRequired 字段", async () => {
    const r = await callAdmin(loginConfigHandler, {
      method: "GET",
      url: "/api/auth/login-config",
    }) as { captchaRequired: boolean };
    expect(typeof r.captchaRequired).toBe("boolean");
  });
});

describe("auth/logout.post(登出)", () => {
  test("未登录也成功(幂等)", async () => {
    const r = await callAdmin(logoutHandler, {
      method: "POST",
      url: "/api/auth/logout",
      headers: { [CSRF_HEADER]: CSRF_TOKEN },
    }) as { success: boolean };
    expect(r.success).toBe(true);
  });

  test("已登录 → clearSession 清除", async () => {
    const cookie = await loginSessionCookie();
    const r = await callAdmin(logoutHandler, {
      method: "POST",
      cookie,
      url: "/api/auth/logout",
      headers: { [CSRF_HEADER]: CSRF_TOKEN },
    }) as { success: boolean };
    expect(r.success).toBe(true);
  });
});

describe("auth/me.get(当前用户)", () => {
  test("未登录 → 401", async () => {
    await expect(callAdmin(meHandler, {
      method: "GET",
      url: "/api/auth/me",
    })).rejects.toMatchObject({ statusCode: 401 });
  });

  test("已登录 → 返回用户字段", async () => {
    const cookie = await loginSessionCookie();
    const r = await callAdmin(meHandler, {
      method: "GET",
      cookie,
      url: "/api/auth/me",
    }) as { uid: number, name: string, mail: string };
    expect(r.uid).toBeGreaterThan(0);
    expect(r.name).toBeTruthy();
  });
});

describe("auth/verify.get(会话验证)", () => {
  test("未登录 → valid:false + hasUser 字段", async () => {
    const r = await callAdmin(verifyHandler, {
      method: "GET",
      url: "/api/auth/verify",
    }) as { valid: boolean, hasUser: boolean, user: unknown };
    expect(r.valid).toBe(false);
    expect(typeof r.hasUser).toBe("boolean");
    expect(r.user).toBeNull();
  });

  test("已登录 → valid:true + user 字段", async () => {
    const cookie = await loginSessionCookie();
    const r = await callAdmin(verifyHandler, {
      method: "GET",
      cookie,
      url: "/api/auth/verify",
    }) as { valid: boolean, user: { uid: number } };
    expect(r.valid).toBe(true);
    expect(r.user.uid).toBeGreaterThan(0);
  });
});
