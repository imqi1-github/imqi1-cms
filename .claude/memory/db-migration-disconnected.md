---
name: db-migration-disconnected
description: 项目没有 prisma/migrations，靠 db push / 原始 SQL 同步 schema；禁用 migrate dev/reset；init-db.sql 只用于空库初始化，结构变更由站主手动 ALTER
metadata:
  type: project
---

**`prisma/migrations/` 目录不存在**（`git ls-files prisma/` 只有 `schema.prisma`）。项目实际通过 `prisma db push` 或原始 SQL 同步 schema；库内索引/约束名多为单数（`Comment_*`/`Meta_*`/`User_*`）而 `schema.prisma` 用复数（`Metas_*`）——这是**既成环境事实，不是 bug**。

**Why:** 直接 `bunx prisma migrate dev` 会因历史不一致而尝试 reset，有**丢数据/重置**风险。

**How to apply:**
- schema 变更 + 数据搬运：用 `prisma db execute --file` 或自写 tsx 脚本（`@prisma/adapter-pg` 的 PrismaClient + `$queryRawUnsafe`/`$executeRawUnsafe`）直接操作，写成幂等 + `--apply` 开关；先 dry-run 用 `information_schema` 确认真实列名与 FK 名（**不要假设是 schema 里的 map 名**）。
- **不要用 migrate dev/reset。**
- 验证漂移用 `prisma migrate diff --from-schema <file> --to-config-datasource --exit-code`（`--from-schema-datamodel` 已在新版移除，改用 `--from-schema`）；diff 输出会被上述脱节噪音污染，只关注自己改的表，可另用 `information_schema.REFERENTIAL_CONSTRAINTS` 复核 FK 真实存在。
- 运行时 client 在 `server/utils/prisma.ts`，env 是 `DB_HOST/DB_PORT/DB_USER/DB_PASSWORD/DB_NAME`；`prisma.config.ts`（Prisma CLI）用同一套拼 `postgresql://` 串 —— **全仓已无任何地方读 `DATABASE_URL`**。
- 多对多 join 模型现名 `contenttravels`（`prisma/schema.prisma:194`）。

**`scripts/init-db.sql` 只用于空库初始化**：当前是**非幂等版本**（纯 `CREATE TABLE`，无 `IF NOT EXISTS`、无 ALTER/DO$$ 迁移块），旧库上重跑会直接报错。**数据库结构变更一律由站主手动执行 ALTER** —— 不要往 init-db.sql 里塞 ALTER/向后兼容块，也不要建议「部署后跑 db:init」来迁移结构（db:init 只管初始化）。发版时把「旧版本 → 新版本」的手动迁移 SQL 写进 GitHub Release Notes。schema 变更后同步三处：`prisma/schema.prisma`、`scripts/init-db.sql`（建表内联新列/新表）、Release Notes（手动 ALTER）。

相关：[[schema-fingerprint-attribution]]、[[init-db-explicit-cid-serial-pg-p2002]]、[[validation-length-caps]]
