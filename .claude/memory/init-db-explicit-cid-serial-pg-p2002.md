---
name: init-db-explicit-cid-serial-pg-p2002
description: init-db.sql 显式 INSERT contents(cid=1) 不推进 PG SERIAL 序列 → 测试里 create 不带 cid 会撞 P2002；resetDb 后要 setval 或让表空
metadata:
  type: feedback
---

`scripts/init-db.sql` 给 `contents`/`metas` 等表种子数据时**显式指定 id**（`INSERT INTO "contents" ("cid", ...) VALUES (...)`）。PostgreSQL 的 `SERIAL` 在显式值插入时**不调 `nextval()`、序列不推进**（只有 `nextval()` 才推进）。

**后果：** 真实 DB 集成测里 `resetDb()`（`TRUNCATE ... RESTART IDENTITY CASCADE`）把序列拨回 1 并删掉种子行，随后 init-db 的 `ON CONFLICT DO NOTHING` 又插回 `cid=1`（表空时必插）→ 序列仍是 1 → Prisma `db.contents.create()` 不带 cid 时取 `nextval()` = 1 → 撞已存在的 cid=1 → **P2002 / `Unique constraint failed on 'contents_pkey'`**。

**How to apply:**
- 修法 A：测试里**先 resetDb 再 seedContent**（`test/real/db/_smoke.test.ts` 已这样写）。
- 修法 B：`resetDb()` 在 TRUNCATE 后显式 `setval('contents_cid_seq', 1, false)`，让序列从 1 重新开始（更彻底，测试无需手动先 reset）。
- 修法 C：init-db.sql 改成不显式给 id（破坏 seed 的确定性，下游关联的 cid/mid 引用要跟着改）。
- 排查：看到 `contents_pkey` / `metas_pkey` + P2002，先怀疑「init-db 显式 id + 测试顺序」，别急着改代码。

相关：[[db-migration-disconnected]]
