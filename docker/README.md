# Docker 部署（两套版本）

> 使用步骤（准备 `.env`、启动、镜像加速、域名反代、升级备份）见文档站 **[Docker 部署](https://docs.qi1.website/deployment/docker)**。本文件只留与本仓库源码强相关的差异与坑。

| 版本 | 文件 | 服务 | 缓存后端 |
| --- | --- | --- | --- |
| **带 Redis** | `docker-compose.yml` + `Dockerfile` | 应用 + PostgreSQL 16 + Redis 8 | 源站页面缓存与短期缓存都走 Redis（`redis:6379`，DB 0，无鉴权） |
| **不带 Redis** | `docker-compose.noredis.yml` + `Dockerfile.noredis` | 应用 + PostgreSQL 16 | 源站页面缓存落文件（容器内 `/app/.nitro/cache`），短期缓存落进程内存 |

- 两套的 `../` 相对路径都指向项目根，都从根目录 `.env` 读变量（命令统一带 `--env-file .env`）。
- **唯一的开关就是选哪套 compose**：`site.config.ts` 的 `build.redis` 在 Docker 下不生效 —— 两个 Dockerfile 总会把 `REDIS_ENABLED` / `REDIS_HOST` 设进构建环境，而 [shared/redis-config.ts](../shared/redis-config.ts) 取 `环境变量 ?? site.config`，环境变量一旦有值 `site.config` 就永远不被查。
- 接了 CDN 边缘缓存可以用「不带 Redis」这套（页面缓存交给边缘）。注意不带 Redis 时源站缓存是**容器内文件**，`up -d --build` 重建即清空（故意不挂卷）。

## Redis 参数（可选）

默认连 compose 里的 `redis:6379`，**通常不用改**。要连外部 Redis 在**构建命令里**覆盖，别改 `site.config.ts`、也别动 `.env`：

```bash
docker compose --env-file .env -f docker/docker-compose.yml build --build-arg REDIS_HOST=10.0.0.5 --build-arg REDIS_PORT=6379 --build-arg REDIS_DB=1
```

可用变量 `REDIS_ENABLED` / `REDIS_HOST` / `REDIS_PORT` / `REDIS_DB`（不含密码）。`--build-arg` 优先级高于 compose 字面量，改完**必须重新 build**（值在打包时烘焙）。⚠️ 用 `build --build-arg` 再 `up`，**不要**用 `up --build`（后者不接受 `--build-arg`）。

## 运行时覆盖（正常部署不会触发）

烘焙进产物的值不是绝对不可变：Nitro 启动时还会再读一遍 `NUXT_*` / `NITRO_*` 前缀的环境变量（键名规则是路径转大写下划线，`redis.host` → `REDIS_HOST`），会**覆盖**构建期烘焙值。风险只在**把外部环境整个灌进容器**时（`env_file` / `-e` 透传 `.env` 里的 `NUXT_*`）。无前缀的 `REDIS_*` 不读。

## 数据卷与会话

| 卷 | 内容 | 丢了会怎样 |
| --- | --- | --- |
| `imqi1-cms_pg-data` | PostgreSQL 全部数据（文章、评论、设置…） | 整站数据没了 |
| `imqi1-cms_sessions-data` | 登录会话（`sessionStoreType=file`，**未配置时即默认值**） | 全体掉登录态 |
| `imqi1-cms_redis-data` | Redis 持久化（仅带 Redis 版） | 缓存重建，不影响数据 |

- `sessions-data` 挂容器内 `/app/.sessions`。**别改成临时目录、别去掉挂载**：`up -d --build` 重建容器会连带换掉容器文件系统。Dockerfile 里那行 `chown node:node` 也不能删 —— 否则卷是 root 属主，node 用户写不进去（实测 `Permission denied`）。
- 会话存哪看后台「设置 → Session 存储」：`file`（默认，用本卷）/ `database`（跟 pg-data）/ `memory`（容器一重建全体掉线）。
- 上传与日志是 bind mount：`UPLOADS_DIR`（默认项目根 `uploads/`）、`LOGS_DIR`（默认项目根 `logs/`）。宿主目录不存在时 Docker 以 root 创建，容器内 node（uid 1000）写不进去 → `mkdir -p logs uploads && sudo chown 1000:1000 logs uploads`，否则文件日志一直是空的、上传也会失败。

## 常用运维命令

```bash
docker compose --env-file .env -f docker/docker-compose.yml ps
docker compose --env-file .env -f docker/docker-compose.yml logs -f app
docker compose --env-file .env -f docker/docker-compose.yml exec postgres psql -U imqi1 -d imqi1-cms
```

> ⚠️ `down -v` 会删数据卷、清空所有数据。镜像版本以各 Dockerfile / compose 为准（`oven/bun:1.4.4`、`node:24-slim`、`postgres:16-alpine`、`redis:8-alpine`）。
