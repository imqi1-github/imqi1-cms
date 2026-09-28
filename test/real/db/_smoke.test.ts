/**
 * test/real/db 基建自检:验证 setup + helpers 能跑通(连 DB、建测试库、跑 init-db.sql、TRUNCATE、reseed)。
 * 任何 test/real/db/* 集成测失败时,先跑这一个排查基建问题。
 */
import { describe, expect, test } from "bun:test";

import { describeDb, setupDb } from "./_setup";
import { closeDb, getDb, loginDbCookie, resetDb, seedCategory, seedContent, seedTag } from "./_helpers";

describe("test/real/db 基建冒烟", () => {
  test("setupDb → 测试库可达 + 表已建", async () => {
    const cfg = await setupDb();
    expect(cfg.db).toMatch(/_test$/); // 默认后缀 _test(避免污染 dev DB)
    const db = await getDb();
    // 几张核心表存在(由 init-db.sql 建)
    const rows = await db.$queryRawUnsafe<Array<{ table_name: string }>>(
      `SELECT table_name FROM information_schema.tables WHERE table_schema='public' ORDER BY table_name`,
    );
    const names = rows.map(r => r.table_name);
    expect(names).toContain("users");
    expect(names).toContain("contents");
    expect(names).toContain("metas");
    expect(names).toContain("comments");
    expect(names).toContain("contentrelations");
    expect(`测试库:${describeDb(cfg)}`).toBeTruthy(); // 仅用于让人看见库名
  });

  test("resetDb → TRUNCATE CASCADE 后只剩 admin 一个用户", async () => {
    const db = await getDb();
    // 先 resetDb 清掉 init-db 硬编码的 cid=1 行(sequence 也回到 1),
    // 否则 seedContent 用 nextval=1 会撞 init-db 已存在的 cid=1 → P2002
    await resetDb();
    await seedContent({ title: "噪音", slug: "noise" });
    expect(await db.contents.count()).toBeGreaterThan(0);

    await resetDb();

    expect(await db.contents.count()).toBe(0);
    expect(await db.users.count()).toBe(1);
    const admin = await db.users.findFirst({ where: { name: "admin" } });
    expect(admin?.mail).toBe("admin@local");
  });

  test("seedCategory/seedTag/seedContent → 真实写入并能 SELECT 读回", async () => {
    const cat = await seedCategory({ name: "笔记", slug: "notes", type: "category" });
    const tag = await seedTag("JS", "js");
    const post = await seedContent({ title: "Hello", slug: "hello" });

    expect(cat.mid).toBeGreaterThan(0);
    expect(tag.mid).toBeGreaterThan(0);
    expect(post.cid).toBeGreaterThan(0);
    expect(post.uid).toBe(1); // 默认走 admin

    const db = await getDb();
    expect(await db.metas.count({ where: { type: "category" } })).toBe(1); // 只 seedCategory
    expect(await db.metas.count({ where: { type: "tag" } })).toBe(1); // 只 seedTag
  });

  test("loginDbCookie → setSession 真实写入 FileSessionStore 并能取出", async () => {
    const cookie = await loginDbCookie();
    expect(cookie).toContain("session=");
    expect(cookie).toContain("csrf_token=test-csrf");
    // 简单断言:cookie 至少能解析出 session 值
    const m = cookie.match(/session=([^;]+)/);
    expect(m?.[1]).toBeTruthy();
    expect(m?.[1].length).toBeGreaterThan(20); // base64url(32B) ≈ 43 字符
  });

  test("closeDb → 进程退出前清理(此测试只验证调用不抛)", async () => {
    await expect(closeDb()).resolves.toBeUndefined();
    // 重新打开以便后续测试可用
    await getDb();
  });
});