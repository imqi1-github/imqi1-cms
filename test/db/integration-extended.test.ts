/**
 * test/db/integration-extended.test.ts: 真实 DB 补充覆盖
 *
 * 验证 Prisma 各种边缘:
 * - updateMany
 * - findMany 排序稳定性
 * - where NOT + IN
 * - 分组 groupBy
 */
import { afterAll, beforeEach, describe, expect, test } from "bun:test";

import { cleanDb, db, disconnectDb, skipIfNoDb } from "#test/db/setup";

const d = describe;

if (skipIfNoDb()) {
  d.skip("extended DB (no DB configured)", () => {});
} else {
  describe("extended DB 集成", () => {
    beforeEach(async () => {
      await cleanDb();
    });

    afterAll(async () => {
      await disconnectDb();
    });

    test("updateMany:批量改 status + 返回 count", async () => {
      for (let i = 0; i < 5; i++) {
        await db.contents.create({
          data: { title: `upd-${i}`, slug: `upd-${i}`, status: 0, type: 0, uid: 1, update_time: new Date() },
        });
      }
      const result = await db.contents.updateMany({
        where: { slug: { startsWith: "upd-" } },
        data: { status: 1 },
      });
      expect(result.count).toBe(5);
      const all = await db.contents.findMany({ where: { slug: { startsWith: "upd-" } } });
      expect(all.every(c => c.status === 1)).toBe(true);
    });

    test("where NOT IN:排除指定 id", async () => {
      for (let i = 0; i < 5; i++) {
        await db.contents.create({
          data: { title: `not-${i}`, slug: `not-${i}`, status: 1, type: 0, uid: 1, update_time: new Date() },
        });
      }
      const all = await db.contents.findMany({ where: { slug: { startsWith: "not-" } } });
      const excludeIds = [all[0]!.cid, all[1]!.cid];
      const filtered = await db.contents.findMany({
        where: {
          slug: { startsWith: "not-" },
          cid: { notIn: excludeIds },
        },
      });
      expect(filtered).toHaveLength(3);
      expect(filtered.every(c => !excludeIds.includes(c.cid))).toBe(true);
    });

    test("groupBy:按 status 分组计数", async () => {
      for (let i = 0; i < 5; i++) {
        await db.contents.create({
          data: { title: `g-${i}`, slug: `g-${i}`, status: i < 3 ? 1 : 0, type: 0, uid: 1, update_time: new Date() },
        });
      }
      const groups = await db.contents.groupBy({
        by: ["status"],
        _count: true,
        where: { slug: { startsWith: "g-" } },
      });
      const status1 = groups.find(g => g.status === 1);
      const status0 = groups.find(g => g.status === 0);
      expect(status1?._count).toBe(3);
      expect(status0?._count).toBe(2);
    });

    test("findMany 排序稳定性:相同 sort 值时 by id 二级排序", async () => {
      for (let i = 0; i < 3; i++) {
        await db.contents.create({
          data: {
            title: `sort-${i}`,
            slug: `sort-${i}`,
            status: 1,
            type: 0,
            uid: 1,
            comment_num: 5, // 全部相同 sort key
            update_time: new Date(),
          },
        });
      }
      const sorted = await db.contents.findMany({
        where: { slug: { startsWith: "sort-" } },
        orderBy: [{ comment_num: "desc" }, { cid: "asc" }],
      });
      expect(sorted).toHaveLength(3);
      // 相同 comment_num(5)时,按 cid asc
      expect(sorted[0]!.cid).toBeLessThan(sorted[1]!.cid);
      expect(sorted[1]!.cid).toBeLessThan(sorted[2]!.cid);
    });

    test("createMany + 之后 update by 业务字段:返回 affected = 实际更新数", async () => {
      const data = Array.from({ length: 3 }, (_, i) => ({
        title: `bulk-upd-${i}`,
        slug: `bulk-upd-${i}`,
        status: 0,
        type: 0,
        uid: 1,
        update_time: new Date(),
      }));
      await db.contents.createMany({ data });
      const result = await db.contents.updateMany({
        where: { slug: { startsWith: "bulk-upd-" }, status: 0 },
        data: { status: 1 },
      });
      expect(result.count).toBe(3);
    });

    test("findUnique:复合唯一键(contentrelations 由 mid+cid 联合)", async () => {
      const a = await db.contents.create({
        data: { title: "cu", slug: "cu", status: 1, type: 0, uid: 1, update_time: new Date() },
      });
      const t = await db.metas.create({ data: { name: "cu-t", slug: "cu-t", type: "tag" } });
      await db.contentrelations.create({ data: { cid: a.cid, mid: t.mid } });
      const got = await db.contentrelations.findUnique({
        where: { mid_cid: { mid: t.mid, cid: a.cid } },
      });
      expect(got?.cid).toBe(a.cid);
      expect(got?.mid).toBe(t.mid);
    });
  });
}