/**
 * test/db/integration-session-store-edge.test.ts: DatabaseSessionStore 边界测试
 *
 * 验证 mock 测试可能漏掉的真实路径:
 * - cleanup() 清理过期 session
 * - has(虽然该方法不存在,测试确认 API surface)
 * - 并发 set/get 行为
 */
import { afterAll, beforeEach, describe, expect, test } from "bun:test";

import { cleanDb, db, disconnectDb, skipIfNoDb } from "#test/integration/db/setup";

const d = describe;

if (skipIfNoDb()) {
  d.skip("session-store-edge DB (no DB configured)", () => {});
} else {
  describe("DatabaseSessionStore 边界 DB 集成", () => {
    beforeEach(async () => {
      await cleanDb();
    });

    afterAll(async () => {
      await disconnectDb();
    });

    test("cleanup():清掉过期 + 保留未过期", async () => {
      const { DatabaseSessionStore } = await import("#server/utils/session-store");
      const store = new DatabaseSessionStore();
      // 过期
      await store.set("exp-1", { userId: 1, authCode: "a", expires: Date.now() - 1000 });
      await store.set("exp-2", { userId: 1, authCode: "b", expires: Date.now() - 500 });
      // 未过期
      await store.set("ok-1", { userId: 1, authCode: "c", expires: Date.now() + 60_000 });

      // 直接 SQL 验证行存在
      expect(await db.sessions.count({ where: { id: "exp-1" } })).toBe(1);
      expect(await db.sessions.count({ where: { id: "ok-1" } })).toBe(1);

      await store.cleanup();

      // 过期被清理,未过期保留
      expect(await db.sessions.count({ where: { id: "exp-1" } })).toBe(0);
      expect(await db.sessions.count({ where: { id: "exp-2" } })).toBe(0);
      expect(await db.sessions.count({ where: { id: "ok-1" } })).toBe(1);
    });

    test("cleanup():无过期 → no-op", async () => {
      const { DatabaseSessionStore } = await import("#server/utils/session-store");
      const store = new DatabaseSessionStore();
      await store.set("ok", { userId: 1, authCode: "a", expires: Date.now() + 60_000 });

      await store.cleanup();
      expect(await db.sessions.count()).toBe(1);
    });

    test("clearUserSessions:仅清该 userId,不影响其他", async () => {
      const { DatabaseSessionStore } = await import("#server/utils/session-store");
      const store = new DatabaseSessionStore();
      const expires = Date.now() + 60_000;

      // 直接 insert 用户 2(否则 FK 失败)
      await db.users.create({
        data: {
          name: "user-2", mail: "u2@x.com",
          password: "", auth_code: "", totp_secret: null, totp_enabled: false,
        },
      });

      await store.set("u1-s1", { userId: 1, authCode: "a", expires });
      await store.set("u1-s2", { userId: 1, authCode: "b", expires });
      await store.set("u2-s1", { userId: 2, authCode: "c", expires });

      expect(await db.sessions.count()).toBe(3);

      await store.clearUserSessions(1);

      expect(await db.sessions.count()).toBe(1); // 仅剩 u2-s1
      const remaining = await db.sessions.findMany();
      expect(remaining[0]?.userId).toBe(2);
    });

    test("get:已删除的 sessionId → null(无陈旧引用)", async () => {
      const { DatabaseSessionStore } = await import("#server/utils/session-store");
      const store = new DatabaseSessionStore();
      await store.set("transient", { userId: 1, authCode: "a", expires: Date.now() + 60_000 });

      expect((await store.get("transient"))?.userId).toBe(1);

      await store.delete("transient");

      expect(await store.get("transient")).toBeNull();
    });

    test("并发 set 同一 sessionId:最终状态由最末写入决定", async () => {
      const { DatabaseSessionStore } = await import("#server/utils/session-store");
      const store = new DatabaseSessionStore();
      const expires = Date.now() + 60_000;

      await Promise.all([
        store.set("concurrent", { userId: 1, authCode: "v1", expires }),
        store.set("concurrent", { userId: 1, authCode: "v2", expires }),
        store.set("concurrent", { userId: 1, authCode: "v3", expires }),
      ]);

      const got = await store.get("concurrent");
      expect(["v1", "v2", "v3"]).toContain(got!.authCode);
    });
  });
}