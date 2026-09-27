/**
 * test/db/integration-session-store.test.ts: 真实 DB 测试 DatabaseSessionStore
 *
 * 验证 mock 测试无法覆盖的部分:
 * - sessions 表的 upsert/findUnique/delete 真 SQL
 * - expires 字段类型兼容性(PG timestamp vs JS Date)
 * - 跨多次 get/set 的一致性
 */
import { afterAll, beforeEach, describe, expect, test } from "bun:test";

import { cleanDb, db, disconnectDb, skipIfNoDb } from "#test/db/setup";

const d = describe;

if (skipIfNoDb()) {
  d.skip("DatabaseSessionStore DB (no DB configured)", () => {});
} else {
  describe("DatabaseSessionStore DB 集成测试", () => {
    beforeEach(async () => {
      await cleanDb();
    });

    afterAll(async () => {
      await disconnectDb();
    });

    test("set + get 往返一致", async () => {
      const { DatabaseSessionStore } = await import("#server/utils/session-store");
      const store = new DatabaseSessionStore();
      const expires = new Date(Date.now() + 60_000);
      await store.set("sid-1", { userId: 1, authCode: "ac", expires });
      const got = await store.get("sid-1");
      expect(got).not.toBeNull();
      expect(got?.userId).toBe(1);
      expect(got?.authCode).toBe("ac");
      // expires 可以是 Date 或 string(由 Prisma adapter 决定),转 Date 后比对
      const gotExpires = new Date(got!.expires as unknown as string | number | Date);
      expect(Math.abs(gotExpires.getTime() - expires.getTime())).toBeLessThan(2000);
    });

    test("未记录的 sessionId → null", async () => {
      const { DatabaseSessionStore } = await import("#server/utils/session-store");
      const store = new DatabaseSessionStore();
      expect(await store.get("never-exists")).toBeNull();
    });

    test("过期会话 → get 时删除并返回 null", async () => {
      const { DatabaseSessionStore } = await import("#server/utils/session-store");
      const store = new DatabaseSessionStore();
      const expired = new Date(Date.now() - 1000); // 1 秒前过期
      await store.set("sid-expired", { userId: 1, authCode: "ac", expires: expired });
      const got = await store.get("sid-expired");
      expect(got).toBeNull();
      // 过期后行被删除
      const row = await db.sessions.findUnique({ where: { id: "sid-expired" } });
      expect(row).toBeNull();
    });

    test("delete:不存在的 sessionId → 不报错", async () => {
      const { DatabaseSessionStore } = await import("#server/utils/session-store");
      const store = new DatabaseSessionStore();
      await store.delete("never-exists");
      expect(await store.get("never-exists")).toBeNull();
    });

    test("多次 upsert 同一 sessionId → 后写覆盖前写", async () => {
      const { DatabaseSessionStore } = await import("#server/utils/session-store");
      const store = new DatabaseSessionStore();
      await store.set("sid", { userId: 1, authCode: "v1", expires: new Date(Date.now() + 60_000) });
      await store.set("sid", { userId: 1, authCode: "v2", expires: new Date(Date.now() + 60_000) });
      const got = await store.get("sid");
      expect(got?.authCode).toBe("v2");
    });

    test("clearUserSessions:删该 user 全部 session", async () => {
      const { DatabaseSessionStore } = await import("#server/utils/session-store");
      const store = new DatabaseSessionStore();
      const expires = new Date(Date.now() + 60_000);
      await store.set("u1-s1", { userId: 1, authCode: "a", expires });
      await store.set("u1-s2", { userId: 1, authCode: "b", expires });
      await store.set("u2-s1", { userId: 2, authCode: "c", expires });

      await store.clearUserSessions(1);

      expect(await store.get("u1-s1")).toBeNull();
      expect(await store.get("u1-s2")).toBeNull();
      // 其他 user 的 session 不受影响
      expect(await store.get("u2-s1")).not.toBeNull();
    });
  });
}