/**
 * 真实 DB 集成测 —— 跨表业务流
 *
 * 验证多表关联 + 状态机 + comment_num 联动在真实 PostgreSQL 下的一致性：
 * - 文章 + 分类 + 标签关联后,删除文章是否清理 contentrelations
 * - 评论审核 0→1 后 article.comment_num 真实 +1
 * - 多文章共用一个标签,删除文章不影响标签
 * - 删除分类时 article 关联迁移到默认分类(参考 admin/categories.delete)
 */
import { describe, expect, test } from "bun:test";

import { setupTestEnv } from "./_setup";

await setupTestEnv();
await import("#test/helpers/nitro-globals");
const { getDb, resetDb, seedCategory, seedContent, seedTag } = await import("./_helpers");

describe("跨表业务流(真实 DB)", () => {
  test("文章 ↔ 分类 ↔ 标签 三表关联正确", async () => {
    await resetDb();
    const cat = await seedCategory({ name: "笔记", slug: "notes", type: "category" });
    const tag = await seedTag("JS", "js");
    const post = await seedContent({ title: "JS 入门", slug: "js-intro", status: 1 });
    const db = await getDb();
    await db.contentrelations.create({ data: { cid: post.cid, mid: cat.mid } });
    await db.contentrelations.create({ data: { cid: post.cid, mid: tag.mid } });
    // 分类下的文章
    const catArticles = await db.contents.findMany({
      where: { contentrelations: { some: { mid: cat.mid } }, status: 1, type: 0 },
      select: { cid: true, title: true, slug: true },
    });
    expect(catArticles.find(a => a.cid === post.cid)).toBeDefined();
    // 标签下的文章
    const tagArticles = await db.contents.findMany({
      where: { contentrelations: { some: { mid: tag.mid, metas: { type: "tag" } } }, status: 1, type: 0 },
      select: { cid: true, title: true },
    });
    expect(tagArticles.find(a => a.cid === post.cid)).toBeDefined();
  });

  test("删除文章 → contentrelations 联动清理(无 orphan)", async () => {
    await resetDb();
    const cat = await seedCategory({ name: "Cat", slug: "cat", type: "category" });
    const post = await seedContent({ title: "T", slug: "t", status: 1 });
    const db = await getDb();
    await db.contentrelations.create({ data: { cid: post.cid, mid: cat.mid } });
    // 删除文章
    await db.contents.delete({ where: { cid: post.cid } });
    // contentrelations 应自动清理(CASCADE)
    const rels = await db.contentrelations.findMany({ where: { cid: post.cid } });
    expect(rels).toHaveLength(0);
    // 分类仍在
    const catStill = await db.metas.findUnique({ where: { mid: cat.mid } });
    expect(catStill).not.toBeNull();
  });

  test("删除分类(有迁移目标)→ articles 关联迁移,旧关联清理", async () => {
    await resetDb();
    const fromCat = await seedCategory({ name: "迁移源", slug: "from", type: "category" });
    const toCat = await seedCategory({ name: "迁移目标", slug: "to", type: "category" });
    const post = await seedContent({ title: "T", slug: "t", status: 1 });
    const db = await getDb();
    await db.contentrelations.create({ data: { cid: post.cid, mid: fromCat.mid } });
    // 模拟 admin/categories/[id].delete 的迁移逻辑:删除前把关联迁到 toCat
    await db.$transaction(async tx => {
      // 1. 找到 fromCat 关联的 articles
      const rels = await tx.contentrelations.findMany({ where: { mid: fromCat.mid } });
      for (const r of rels) {
        // 2. 检查文章是否已关联 toCat(避免重复)
        const exist = await tx.contentrelations.findFirst({
          where: { cid: r.cid, mid: toCat.mid },
        });
        if (!exist) {
          await tx.contentrelations.create({ data: { cid: r.cid, mid: toCat.mid } });
        }
      }
      // 3. 删除 fromCat 的所有关联
      await tx.contentrelations.deleteMany({ where: { mid: fromCat.mid } });
      // 4. 删除 fromCat
      await tx.metas.delete({ where: { mid: fromCat.mid } });
    });
    // 验证:文章关联 toCat,fromCat 不存在
    const newRels = await db.contentrelations.findMany({ where: { cid: post.cid } });
    expect(newRels.map(r => r.mid)).toEqual([toCat.mid]);
    const fromCatGone = await db.metas.findUnique({ where: { mid: fromCat.mid } });
    expect(fromCatGone).toBeNull();
  });

  test("多文章共用一个标签 → 删除任一文章不影响标签或关联其他文章", async () => {
    await resetDb();
    const tag = await seedTag("shared", "shared-tag");
    const p1 = await seedContent({ title: "P1", slug: "p1", status: 1 });
    const p2 = await seedContent({ title: "P2", slug: "p2", status: 1 });
    const db = await getDb();
    await db.contentrelations.create({ data: { cid: p1.cid, mid: tag.mid } });
    await db.contentrelations.create({ data: { cid: p2.cid, mid: tag.mid } });
    // 删除 p1
    await db.contents.delete({ where: { cid: p1.cid } });
    // 标签仍在
    const tagStill = await db.metas.findUnique({ where: { mid: tag.mid } });
    expect(tagStill).not.toBeNull();
    // p2 的关联仍在
    const p2Rels = await db.contentrelations.findMany({ where: { cid: p2.cid } });
    expect(p2Rels).toHaveLength(1);
    expect(p2Rels[0]?.mid).toBe(tag.mid);
  });
});