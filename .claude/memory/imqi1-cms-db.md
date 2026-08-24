---
name: imqi1-cms-db
description: "库名 imqi1-cms(与目录/包名一致);本地已装 MySQL 8.4.9 便携版,DB_* 由 .env 提供,开机自启在 Startup"
metadata:
  node_type: memory
  type: project
  originSessionId: 9a9ab936-5454-4fab-9f6d-5e6b1aee64b2
---

项目库名是 **imqi1-cms**(与项目目录、package.json 名一致)。旧名 `imqi1-nodejs` / `nodejs-imqi1` 已于 2026-08-24 统一改掉。

**连接机制**:应用运行时用 @prisma/adapter-mariadb 读拆分的 DB_HOST/DB_PORT/DB_USER/DB_PASSWORD/DB_NAME;Prisma CLI(studio / db execute)由 prisma.config.ts 把这套变量拼成 mysql:// 串。schema.prisma 的 datasource 不写 url,靠 prisma.config.ts 注入。

**本地环境(本机,2026-08-24 起)**:已装便携版 MySQL 8.4.9(非服务、无需提权;**路径随机器**,本机为 `C:\mysql-8.4\mysql-8.4.9-winx64`),`.env` 已设 DB_*(DB_NAME=imqi1-cms)。本机开机自启:Startup 文件夹的 `start-mysql.vbs`。初始化:先起 mysqld,再 `bun run prisma:generate` + `bun run db:init`(幂等,建 15 表 + 种子,管理员 admin/123456)。相关:[[db-migration-disconnected]]。
