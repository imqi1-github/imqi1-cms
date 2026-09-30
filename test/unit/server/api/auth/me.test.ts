/**
 * /api/auth/me.get:返回当前会话用户资料(白名单字段)
 *
 *  - 401:未登录
 *  - 缓存头:no-store(per-user GET,禁止代理/浏览器缓存)
 *  - 仅返回 uid/name/nickname/mail/avatar 5 字段(白名单)
 *  - 严禁暴露 authCode / password / totp_secret 等敏感列(白名单保证不漏)
 */
import "#test/helpers/nitro-globals";

import { beforeEach, describe, expect, test } from "bun:test";

import { makeAuthEvent, loginSessionCookie, resetUsers, patchUser } from "#test/helpers/auth-fakes";

const { default: handler } = await import("#server/api/auth/me.get");

beforeEach(() => {
  resetUsers();
});

describe("me.get:未登录", () => {
  test("无 session cookie → 401 Unauthorized", async () => {
    const { event } = makeAuthEvent({ method: "GET", cookie: "" });
    await expect(handler(event)).rejects.toMatchObject({ statusCode: 401, message: "Unauthorized" });
  });
});

describe("me.get:缓存头", () => {
  test("已登录也设置 no-store(per-user GET,禁缓存)", async () => {
    const session = await loginSessionCookie();
    const { event, headers } = makeAuthEvent({ method: "GET", cookie: session });
    await handler(event);
    expect(headers["cache-control"]).toBe("no-store");
  });

  test("未登录的 401 错误响应同样 no-store(防止反复被代理缓存住)", async () => {
    const { event, headers } = makeAuthEvent({ method: "GET", cookie: "" });
    await expect(handler(event)).rejects.toMatchObject({ statusCode: 401 });
    expect(headers["cache-control"]).toBe("no-store");
  });
});

describe("me.get:响应字段白名单", () => {
  test("已登录 → 仅暴露 uid/name/nickname/mail/avatar,5 字段", async () => {
    const session = await loginSessionCookie();
    const { event } = makeAuthEvent({ method: "GET", cookie: session });
    const r = (await handler(event)) as Record<string, unknown>;
    expect(Object.keys(r).sort()).toEqual(["avatar", "mail", "name", "nickname", "uid"]);
  });

  test("绝不能返回 authCode / password / totp_secret / totp_enabled 等敏感列", async () => {
    const session = await loginSessionCookie();
    const { event } = makeAuthEvent({ method: "GET", cookie: session });
    const r = (await handler(event)) as Record<string, unknown>;
    expect(r.authCode).toBeUndefined();
    expect(r.password).toBeUndefined();
    expect(r.totp_secret).toBeUndefined();
    expect(r.totp_enabled).toBeUndefined();
  });

  test("返回字段值与 users 表一致(uid/name/nickname/mail/avatar)", async () => {
    patchUser(1, { name: "admin", nickname: "阿棋", mail: "a@b.c", avatar: null });
    const session = await loginSessionCookie();
    const { event } = makeAuthEvent({ method: "GET", cookie: session });
    expect(await handler(event)).toEqual({
      uid: 1,
      name: "admin",
      nickname: "阿棋",
      mail: "a@b.c",
      avatar: null,
    });
  });

  test("avatar 为 null / nickname 为 null 时也能正确返回(null 与缺省语义不同)", async () => {
    patchUser(1, { nickname: null, avatar: null });
    const session = await loginSessionCookie();
    const { event } = makeAuthEvent({ method: "GET", cookie: session });
    const r = (await handler(event)) as Record<string, unknown>;
    expect(r.nickname).toBeNull();
    expect(r.avatar).toBeNull();
  });
});

describe("me.get:HTTP 方法限制", () => {
  test("仅 GET(POST/PUT/DELETE 不报错但按 GET 走也无副作用)", async () => {
    const session = await loginSessionCookie();
    const { event } = makeAuthEvent({ method: "POST", cookie: session });
    // POST 仍能返回(本接口不区分 method);断言不抛
    expect(await handler(event)).toBeDefined();
  });
});