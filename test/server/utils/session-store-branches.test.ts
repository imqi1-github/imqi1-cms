import "#test/helpers/nitro-globals";

import { beforeEach, describe, expect, mock, test } from "bun:test";

import { mockSharedPrisma, sharedFake } from "#test/helpers/fake-prisma";

mockSharedPrisma();

// ===== login-rate-limit 的 Redis 分支(redis 假件可控行为) =====
const failCounts = new Map<string, number>();
const lockTtls = new Map<string, number>();
let redisDown = false;

mock.module("#server/utils/redis", () => ({
  redis: {
    ttl: async (k: string) => {
      if (redisDown) throw new Error("redis down");
      return lockTtls.get(k) ?? -1;
    },
    incr: async (k: string) => {
      if (redisDown) throw new Error("redis down");
      failCounts.set(k, (failCounts.get(k) ?? 0) + 1);
      return failCounts.get(k)!;
    },
    expire: async (_k: string, _s: number) => "OK",
    set: async (k: string, _v: string, _ex: string, _s: number) => {
      lockTtls.set(k, 900);
      return "OK";
    },
    get: async (k: string) => String(failCounts.get(k) ?? 0),
    del: async (...ks: string[]) => {
      ks.forEach(k => {
        failCounts.delete(k);
        lockTtls.delete(k);
      });
      return ks.length;
    },
  },
}));

const { checkLoginRateLimit, recordLoginFailure, resetLoginAttempts, hasRecentFailures } =
  await import("#server/utils/login-rate-limit");

beforeEach(() => {
  failCounts.clear();
  lockTtls.clear();
  redisDown = false;
});

describe("login-rate-limit(Redis 分支)", () => {
  test("锁定中:ttl>0 → locked=true 且带剩余秒数", async () => {
    lockTtls.set("login:lock:1.2.3.4", 600);
    const r = await checkLoginRateLimit("1.2.3.4");
    expect(r.locked).toBe(true);
    expect(r.retryAfter).toBe(600_000);
  });

  test("未锁定:ttl=-1 → locked=false", async () => {
    expect(await checkLoginRateLimit("1.2.3.4")).toEqual({ locked: false, retryAfter: 0 });
  });

  test("Redis incr 计数到 5 → 写入锁;不足 5 不写", async () => {
    await recordLoginFailure("1.2.3.5");
    expect(lockTtls.has("login:lock:1.2.3.5")).toBe(false);
    for (let i = 0; i < 4; i++) await recordLoginFailure("1.2.3.5");
    expect(lockTtls.has("login:lock:1.2.3.5")).toBe(true);
  });

  test("reset 删除计数与锁", async () => {
    await recordLoginFailure("1.2.3.6");
    await recordLoginFailure("1.2.3.6");
    await resetLoginAttempts("1.2.3.6");
    expect(await hasRecentFailures("1.2.3.6")).toBe(false);
  });

  test("Redis 抛错不阻断:回落内存兜底(锁定生效)", async () => {
    redisDown = true;
    for (let i = 0; i < 5; i++) await recordLoginFailure("7.7.7.7");
    const r = await checkLoginRateLimit("7.7.7.7");
    expect(r.locked).toBe(true);
  });

  test("hasRecentFailures 读 Redis 计数", async () => {
    failCounts.set("login:fail:1.2.3.7", 2);
    expect(await hasRecentFailures("1.2.3.7")).toBe(true);
    failCounts.delete("login:fail:1.2.3.7");
    expect(await hasRecentFailures("1.2.3.7")).toBe(false);
  });
});

// ===== session-store Database 分支(sessions 假件) =====
let sessionRows = new Map<string, { userId: number; authCode: string; expires: Date }>();

sharedFake.on("sessions", "findUnique", async ({ where }: { where: { id: string } }) => {
  const row = sessionRows.get(where.id);
  return row ? { ...row } : null;
});
sharedFake.on("sessions", "delete", async ({ where }: { where: { id: string } }) => {
  sessionRows.delete(where.id);
  return {};
});
sharedFake.on("sessions", "deleteMany", async () => {
  const n = sessionRows.size;
  sessionRows.clear();
  return { count: n };
});
sharedFake.on("sessions", "upsert", async ({ where, create }: { where: { id: string }; create: { userId: number; authCode: string; expires: Date } }) => {
  sessionRows.set(where.id, { ...create });
  return { ...create };
});
sharedFake.on("informations", "findUnique", async ({ where }: { where: { key: string } }) =>
  where.key === "sessionStoreType" ? { value: "database" } : null);

const { getSessionStore } = await import("#server/utils/session-store");

let store: Awaited<ReturnType<typeof getSessionStore>>;

beforeEach(async () => {
  sessionRows = new Map();
  // 重置 globalThis 单例,让 getSessionStore 重建为 database store
  const g = globalThis as unknown as Record<string, unknown>;
  delete g.__imqiSessionStore;
  delete g.__imqiSessionStoreType;
  store = await getSessionStore();
});

describe("session-store DatabaseSessionStore", () => {
  test("set→getSessionStore→get 往返(expires Date 转回时间戳)", async () => {
    await store.set("db1", { userId: 1, authCode: "ac", expires: Date.now() + 60_000 });
    const got = await store.get("db1");
    expect(got).toMatchObject({ userId: 1, authCode: "ac" });
  });

  test("过期会话:findUnique 返回 null(实现内部已删)", async () => {
    // 直接预置过期行
    sessionRows.set("db-exp", { userId: 1, authCode: "x", expires: new Date(Date.now() - 1000) });
    expect(await store.get("db-exp")).toBeNull();
    expect(sessionRows.has("db-exp")).toBe(false);
  });

  test("delete 删除会话行", async () => {
    sessionRows.set("db-del", { userId: 1, authCode: "a", expires: new Date(Date.now() + 60_000) });
    await store.delete("db-del");
    expect(sessionRows.has("db-del")).toBe(false);
  });

  test("clearUserSessions 按用户清;cleanup 清全部过期", async () => {
    sessionRows.set("u7-a", { userId: 7, authCode: "a", expires: new Date(Date.now() + 60_000) });
    sessionRows.set("u7-b", { userId: 7, authCode: "b", expires: new Date(Date.now() + 60_000) });
    await store.clearUserSessions(7);
    expect([...sessionRows.values()].filter(s => s.userId === 7)).toHaveLength(0);
    await store.cleanup();
  });
});
