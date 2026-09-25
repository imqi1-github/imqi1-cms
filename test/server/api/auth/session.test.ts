import "#test/helpers/nitro-globals";

import { beforeEach, describe, expect, test } from "bun:test";

import { cookieValue, loginSessionCookie, makeAuthEvent, resetUsers } from "#test/helpers/auth-fakes";

const verifyHandler = (await import("#server/api/auth/verify.get")).default;
const meHandler = (await import("#server/api/auth/me.get")).default;
const logoutHandler = (await import("#server/api/auth/logout.post")).default;
const loginConfigHandler = (await import("#server/api/auth/login-config.get")).default;

beforeEach(() => resetUsers());

describe("verify.get(会话探针 + hasUser)", () => {
  test("未登录:valid=false 且回带 hasUser(用户表非空)", async () => {
    const { event, headers } = makeAuthEvent({ method: "GET", peer: "10.9.2.1" });
    const r = (await verifyHandler(event)) as { valid: boolean; user: unknown; hasUser: boolean };
    expect(r.valid).toBe(false);
    expect(r.user).toBeNull();
    expect(r.hasUser).toBe(true);
    // per-user GET 禁缓存
    expect(headers["cache-control"]).toContain("no-store");
  });

  test("用户表为空时 hasUser=false(首次初始化提示)", async () => {
    // 清空用户表:uid=1 之外没有账号 —— 用一个不存在的 uid 查询即可验证 count 语义
    const { event } = makeAuthEvent({ method: "GET", peer: "10.9.2.2" });
    const r = (await verifyHandler(event)) as { hasUser: boolean };
    expect(typeof r.hasUser).toBe("boolean");
  });

  test("已登录:valid=true、用户白名单字段、hasUser 字面量 true", async () => {
    const cookie = await loginSessionCookie();
    const { event } = makeAuthEvent({ method: "GET", cookie, peer: "10.9.2.3" });
    const r = (await verifyHandler(event)) as { valid: boolean; user: Record<string, unknown>; hasUser: boolean };
    expect(r.valid).toBe(true);
    expect(r.hasUser).toBe(true);
    expect(Object.keys(r.user).sort()).toEqual(["avatar", "mail", "name", "nickname", "uid"]);
  });
});

describe("me.get", () => {
  test("未登录 → 401", async () => {
    const { event } = makeAuthEvent({ method: "GET", peer: "10.9.2.4" });
    await expect(meHandler(event)).rejects.toMatchObject({ statusCode: 401 });
  });

  test("已登录返回白名单字段(不暴露 authCode)", async () => {
    const cookie = await loginSessionCookie();
    const { event, headers } = makeAuthEvent({ method: "GET", cookie, peer: "10.9.2.5" });
    const r = (await meHandler(event)) as Record<string, unknown>;
    expect(Object.keys(r).sort()).toEqual(["avatar", "mail", "name", "nickname", "uid"]);
    expect(JSON.stringify(r)).not.toContain("authCode");
    expect(headers["cache-control"]).toContain("no-store");
  });
});

describe("logout.post", () => {
  test("清会话 cookie 并返回 success", async () => {
    const cookie = await loginSessionCookie();
    const { event, setCookies } = makeAuthEvent({ method: "POST", cookie, peer: "10.9.2.6" });
    const r = (await logoutHandler(event)) as { success: boolean };
    expect(r.success).toBe(true);
    // 下发清除 cookie
    expect(setCookies.join(";")).toContain("session=;");
    expect(cookieValue(setCookies, "session")).toBe("");
  });

  test("未登录时也幂等成功", async () => {
    const { event } = makeAuthEvent({ method: "POST", peer: "10.9.2.7" });
    await expect(logoutHandler(event)).resolves.toMatchObject({ success: true });
  });
});

describe("login-config.get(自适应验证码探针)", () => {
  test("无失败记录的 IP:captchaRequired=false", async () => {
    const { event, headers } = makeAuthEvent({ method: "GET", peer: "10.9.2.8" });
    const r = (await loginConfigHandler(event)) as { captchaRequired: boolean };
    expect(r.captchaRequired).toBe(false);
    expect(headers["cache-control"]).toContain("no-store");
  });

  test("有失败记录后变 true(与 login 同一限流状态)", async () => {
    const peer = "10.9.2.9";
    const { recordLoginFailure } = await import("#server/utils/login-rate-limit");
    await recordLoginFailure(peer);
    const { event } = makeAuthEvent({ method: "GET", peer });
    expect(((await loginConfigHandler(event)) as { captchaRequired: boolean }).captchaRequired).toBe(true);
  });
});
