---
name: imqi1-cms-db
description: "库名 imqi1-cms(与目录/包名一致);数据层 PostgreSQL(@prisma/adapter-pg),DB_* 由 .env 提供,db:init 幂等建 16 表+种子"
metadata:
  node_type: memory
  type: project
  originSessionId: 9a9ab936-5454-4fab-9f6d-5e6b1aee64b2
---

项目库名是 **imqi1-cms**(与项目目录、package.json 名一致)。旧名 `imqi1-nodejs` / `nodejs-imqi1` 已于 2026-08-24 统一改掉。

**数据层**:Prisma `datasource db { provider = "postgresql" }`;应用运行时用 `@prisma/adapter-pg` 读拆分 DB_HOST/DB_PORT/DB_USER/DB_PASSWORD/DB_NAME,Prisma CLI(studio / db execute)由 prisma.config.ts 把这套变量拼成 `postgresql://` 串;schema.prisma 的 datasource 不写 url,靠 prisma.config.ts 注入。⚠️ 早先记忆(2026-08-24)写的「MySQL 8.4.9 便携版 + @prisma/adapter-mariadb」是**迁移到 PostgreSQL 前**的状态,已作废。

**初始化**:`bun run db:init`(→ scripts/init-db.ts → scripts/init-db.sql)幂等,建 **16 张表** + 写站点默认设置 + 插入示例数据(管理员 admin/123456,登录后速改)。先 `bun run prisma:generate` 再 `db:init`。相关:[[db-migration-disconnected]]。
