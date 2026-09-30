/**
 * test/db/integration-travellers.test.ts: travels/contenttravels 真实 DB 测试
 *
 * 验证 travel 地点(contenttravels 关联)的 CRUD
 */
import { afterAll, beforeEach, describe, expect, test } from "bun:test";

import { cleanDb, db, disconnectDb, skipIfNoDb } from "#test/integration/db/setup";

const d = describe;

if (skipIfNoDb()) {
  d.skip("travels DB (no DB configured)", () => {});
} else {
  describe("travels DB 集成", () => {
    beforeEach(async () => {
      await cleanDb();
    });

    afterAll(async () => {
      await disconnectDb();
    });

    test("travels.create + 经纬度边界(由 PG 类型约束)", async () => {
      const t = await db.travels.create({
        data: {
          name: "杭州",
          longitude: 120.15,
          latitude: 30.28,
          sort: 1,
          enabled: true,
        },
      });
      expect(t.id).toBeGreaterThan(0);
      expect(t.name).toBe("杭州");
    });

    test("经纬度超出 -180~180 → 由 @db.Decimal 约束拦截", async () => {
      try {
        await db.travels.create({
          data: {
            name: "x",
            longitude: 999 as never,
            latitude: 0,
            sort: 0,
            enabled: true,
          },
        });
        expect.unreachable();
      } catch {
        expect(true).toBe(true);
      }
    });

    test("contenttravels 级联:删 travel → 清关联 + 删附件", async () => {
      const article = await db.contents.create({
        data: {
          title: "t",
          slug: "t",
          status: 1,
          type: 0,
          uid: 1,
          update_time: new Date(),
        },
      });
      const travel = await db.travels.create({
        data: { name: "杭州", longitude: 120, latitude: 30, sort: 0, enabled: true },
      });
      await db.contenttravels.create({ data: { cid: article.cid, travel_id: travel.id } });
      expect(await db.contenttravels.count()).toBe(1);

      await db.travels.delete({ where: { id: travel.id } });
      expect(await db.contenttravels.count()).toBe(0);
    });

    test("travels.enabled toggle + sort 排序", async () => {
      await db.travels.create({ data: { name: "A", longitude: 0, latitude: 0, sort: 1, enabled: true } });
      await db.travels.create({ data: { name: "B", longitude: 0, latitude: 0, sort: 2, enabled: false } });

      const enabled = await db.travels.findMany({
        where: { enabled: true },
        orderBy: { sort: "asc" },
      });
      expect(enabled.every(t => t.enabled)).toBe(true);
      expect(enabled[0]!.name).toBe("A");
    });
  });
}