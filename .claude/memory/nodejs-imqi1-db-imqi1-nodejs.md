---
name: nodejs-imqi1-db-imqi1-nodejs
description: "nodejs-imqi1 的 MariaDB 库是 imqi1-nodejs(非项目同名),DB_* 环境变量本地未设置,查数据走已配的只读 mysql MCP"
metadata: 
  node_type: memory
  type: project
  originSessionId: 9a9ab936-5454-4fab-9f6d-5e6b1aee64b2
---

nodejs-imqi1 项目的 MariaDB 库名是 **imqi1-nodejs**(不是项目名 nodejs-imqi1,顺序相反)。同实例还有 imqi1(20 表,历史/PHP 老站)、imqi1-old、imqi1-test、app-backend(隔壁项目)、django_db——**只动 imqi1-nodejs**,其余勿碰。travels 表(旅行功能)在 imqi1-nodejs,15 张表。

**连接机制**:应用运行时用 @prisma/adapter-mariadb 读拆分的 DB_HOST/DB_PORT/DB_USER/DB_PASSWORD/DB_NAME;Prisma CLI(studio / db execute)由 prisma.config.ts 把这套变量拼成 mysql:// 串。schema.prisma 的 datasource 不写 url,靠 prisma.config.ts 注入。

**本地坑**:.env 没提交(只有 .env.example 占位)、系统环境变量也没设 DB_* → 直接读环境拿不到连接信息。实际凭据要从运行进程或现有 MCP 配置反推(app-backend 的 mysql MCP 配置里有 root@localhost:3306 凭据,与 nodejs-imqi1 同实例不同库)。

**已配只读 mysql MCP**(nodejs-imqi1 项目级,@berthojoris/mcp-mysql-server,权限 list,read):查表结构 / 数据验证用它,呼应 [[db-migration-disconnected]] 禁 write / migrate / reset——写入仍走自写幂等 tsx 脚本。mysql CLI 也可直连(`mysql -h127.0.0.1 -uroot -p imqi1-nodejs`)。相关:[[public-api-explicit-field-whitelist]] [[prisma-relation-key-rename-trap]]。
