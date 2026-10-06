---
name: db-migration-disconnected
description: 项目 DB 与本地 prisma/migrations 历史脱节，靠 db push/原始 SQL 同步，禁用 migrate dev/reset
metadata: 
  node_type: memory
  type: project
  originSessionId: efa205c2-791a-4794-80a3-1a7a9434ff61
---

**⚠️ update（2026-08-23）**：`prisma/migrations/` **目录已不存在**（`git ls-files prisma/` 只有 `schema.prisma`），原记的"14 个迁移/add_travels"已无从验证；项目实际通过 `prisma db push` 或原始 SQL 同步 schema，迁移目录只是历史遗留。原先记录的历史脱节现象（`bunx prisma migrate status` 显示 "last common migration is null"、DB 用另一套 `init`、库内索引/约束名多为单数 `Comment_*`/`Meta_*`/`User_*` 而 schema.prisma 用复数 `Metas_*` 等）仍是既成事实，正是"禁 migrate dev/reset"的原因。

**Why:** 这是既成环境事实，不是 bug。直接 `bunx prisma migrate dev` 会因历史不一致而尝试 reset，有**丢数据/重置**风险。

**How to apply:** schema 变更 + 数据搬运时，用 `prisma db execute --file` 或自写 tsx 脚本（用 `@prisma/adapter-pg` 的 PrismaClient + `$queryRawUnsafe`/`$executeRawUnsafe`）直接操作，写成幂等 + `--apply` 开关；先 dry-run 用 `information_schema` 确认真实列名与 FK 名（不要假设是 schema 里的 map 名）。（注：早先引用的范例 `scripts/migrate-travels-m2n.ts` 已删除；多对多 join 模型现名 `contenttravels`，见 `prisma/schema.prisma:194`）。**不要用 migrate dev/reset**。验证漂移用 `prisma migrate diff --from-schema <file> --to-config-datasource --exit-code`（注意 `--from-schema-datamodel` 已在新版被移除，改用 `--from-schema`；且 diff 输出会被上述脱节噪音污染，只关注自己改的表，可另用 `information_schema.REFERENTIAL_CONSTRAINTS` 复核 FK 真实存在）。运行时 client 走 `server/utils/prisma.ts`，env 是 `DB_HOST/DB_PORT/DB_USER/DB_PASSWORD/DB_NAME`；`prisma.config.ts`（Prisma CLI）也用同一套拼 `postgresql://` 串——**全仓已无任何地方读 `DATABASE_URL`**（2026-09-14 删掉了 prisma.config.ts 里那个「显式设置则优先」的分支）。

**⚠️ update（2026-10-06，站主明确约定）**：`scripts/init-db.sql` **仅用于空库初始化**（当前为非幂等版本：纯 `CREATE TABLE`，无 `IF NOT EXISTS`、无任何 ALTER/DO$$ 迁移块，旧库上重跑会直接报错）。**数据库结构变更一律由站主手动执行 ALTER 语句迁移**——AI 不要往 init-db.sql 里塞 ALTER/向后兼容块，也不要建议「部署后跑 db:init」来迁移结构（db:init 只管初始化）。发版时把「旧版本 → 新版本」的手动迁移 SQL 写进 GitHub Release Notes（参见 v1.2.0 notes 里的 likes 表 + contents.scheduled_at 示例）。schema 变更后同步三处：`prisma/schema.prisma`、`scripts/init-db.sql`（建表内联新列/新表）、Release Notes（手动 ALTER）。
