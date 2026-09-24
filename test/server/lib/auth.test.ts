import "#test/helpers/nitro-globals";

import { describe, expect, test } from "bun:test";

import { mockSharedPrisma, sharedFake } from "#test/helpers/fake-prisma";

// 模拟 DB 侧「当前 auth_code」:users.update 旋转它,单端登录语义的 DB 一半
const currentAuthCode = new Map<number, string>();
sharedFake.on("informations", "findUnique", () => ({ value: "memory" }));
sharedFake.on("users", "update", (args: { where: { uid: number }; data: { auth_code: string } }) => {
  currentAuthCode.set(args.where.uid, args.data.auth_code);
  return {};
});
sharedFake.on("users", "findUnique", (args: { where: { uid: number } }) => {
  const uid = args.where.uid;
  if (uid !== 1) return null;
  return {
    uid,
    name: "admin",
    nickname: "阿棋",
    mail: "a@b.c",
    avatar: null,
    auth_code: currentAuthCode.get(uid) ?? "",
  };
});
mockSharedPrisma();

const { setSession, getUser, clearSession, verifyPassword } = await import("#server/lib/auth");

const USER = { uid: 1, name: "admin", nickname: "阿棋", mail: "a@b.c", avatar: null };

// 造带 cookie 读写能力的 event:h3 setCookie/getCookie/deleteCookie 都走 req.headers.cookie 与 res
function makeEvent(cookie?: string) {
  const setCookieHeaders: string[] = [];
  const headers: Record<string, unknown> = {};
  const res = {
    setHeader(name: string, value: unknown) {
      if (name.toLowerCase() === "set-cookie") setCookieHeaders.push(String(value));
      else headers[name.toLowerCase()] = value;
    },
    getHeader(name: string) {
      if (name.toLowerCase() === "set-cookie") return setCookieHeaders;
      return headers[name.toLowerCase()];
    },
    getHeaders: () => headers,
  };
  const req = { headers: (cookie ? { cookie } : {}) as Record<string, string> };
  return { event: { node: { req, res } }, setCookieHeaders };
}

// 从 Set-Cookie 头里抠出 session=<id>
function sessionIdFromCookie(setCookieHeaders: string[]): string {
  const raw = setCookieHeaders.find(c => c.startsWith("session=")) ?? "";
  return raw.slice("session=".length).split(";")[0] ?? "";
}

describe("setSession(集成:真 MemorySessionStore + 假 prisma)", () => {
  test("返回带 authCode 的用户并种下 httpOnly session cookie", async () => {
    const { event, setCookieHeaders } = makeEvent();
    const result = await setSession(event as never, USER);
    expect(result.authCode).toBeTruthy();
    const cookie = setCookieHeaders.find(c => c.startsWith("session=")) ?? "";
    expect(cookie).toContain("HttpOnly");
    expect(cookie).toContain("SameSite=Lax");
    expect(cookie).not.toContain("Secure");
    // session 真的进了 store:getUser 能读回
    const sid = sessionIdFromCookie(setCookieHeaders);
    const got = await getUser(makeEvent(`session=${sid}`).event as never);
    expect(got?.uid).toBe(1);
    expect(got?.authCode).toBe(result.authCode);
  });

  test("单端登录:第二次登录旋转 auth_code 后,旧 session 失效且下发清除 cookie", async () => {
    const first = makeEvent();
    const u1 = await setSession(first.event as never, USER);
    const sidA = sessionIdFromCookie(first.setCookieHeaders);

    // 旧 session 此刻有效
    expect(await getUser(makeEvent(`session=${sidA}`).event as never)).not.toBeNull();

    // 第二台设备登录:auth_code 被旋转,两次 authCode 必不相同
    const second = makeEvent();
    const u2 = await setSession(second.event as never, USER);
    expect(u2.authCode).not.toBe(u1.authCode);
    const sidB = sessionIdFromCookie(second.setCookieHeaders);
    expect(sidB).not.toBe(sidA);

    // 旧 session 因 authCode 不匹配失效,且响应带清除 cookie(h3 用 Max-Age=0)
    const oldDevice = makeEvent(`session=${sidA}`);
    expect(await getUser(oldDevice.event as never)).toBeNull();
    expect(oldDevice.setCookieHeaders.join(";")).toContain("session=;");
    expect(oldDevice.setCookieHeaders.join(";")).toContain("Max-Age=0");

    // 新 session 仍有效
    expect(await getUser(makeEvent(`session=${sidB}`).event as never)).not.toBeNull();
  });

  test("store 有 session 但用户已不存在:session 被删除并返回 null", async () => {
    const { event, setCookieHeaders } = makeEvent();
    await setSession(event as never, { ...USER, uid: 2 });
    const sid = sessionIdFromCookie(setCookieHeaders);
    // uid=2 在假 prisma 里不存在 → getUser 返回 null
    expect(await getUser(makeEvent(`session=${sid}`).event as never)).toBeNull();
    // 且那条 session 已被删除(孤儿清理)
    const store = await (await import("#server/utils/session-store")).getSessionStore();
    expect(await store.get(sid)).toBeNull();
  });
});

describe("getUser / clearSession", () => {
  test("无 cookie 返回 null", async () => {
    expect(await getUser(makeEvent().event as never)).toBeNull();
  });

  test("伪造的不存在 sessionId 返回 null", async () => {
    expect(await getUser(makeEvent("session=not-exist").event as never)).toBeNull();
  });

  test("clearSession 后同 cookie 再取为 null", async () => {
    const login = makeEvent();
    await setSession(login.event as never, USER);
    const sid = sessionIdFromCookie(login.setCookieHeaders);

    const logout = makeEvent(`session=${sid}`);
    await clearSession(logout.event as never);
    expect(await getUser(makeEvent(`session=${sid}`).event as never)).toBeNull();
    // 响应带清除 cookie
    expect(logout.setCookieHeaders.join(";")).toContain("session=;");
  });
});

describe("verifyPassword(bcryptjs 真跑)", () => {
  test("正确密码通过、错误密码拒绝", async () => {
    const bcrypt = await import("bcryptjs");
    const hash = await bcrypt.default.hash("s3cret!", 10);
    expect(await verifyPassword("s3cret!", hash)).toBe(true);
    expect(await verifyPassword("wrong", hash)).toBe(false);
  });
});
