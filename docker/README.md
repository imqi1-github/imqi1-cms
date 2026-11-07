# Docker 部署（两套版本）

> 面向使用者的完整步骤（准备 `.env`、启动、镜像加速、域名反代、升级备份）见文档站 **[Docker 部署](https://docs.qi1.website/deployment/docker)**。本文件只记录与本仓库源码强相关、文档站不必重复的细节。

本目录提供两套**独立的 Docker 部署文件**，按是否需要 Redis 二选一。两套的 `../` 相对路径均指向项目根目录，且都从根目录的 `.env` 读取变量（运行命令统一带 `--env-file .env`）。

| 版本 | 文件 | 服务 | 说明 |
| --- | --- | --- | --- |
| **带 Redis** | `docker-compose.yml` + `Dockerfile` | 应用 + PostgreSQL 16 + Redis 8 | 构建期烘焙 `redis:6379`（compose 服务名）并启动 redis 容器，源站页面缓存与共享缓存后端共用；redis 数据存于 `redis-data` 卷 |
| **不带 Redis** | `docker-compose.noredis.yml` + `Dockerfile.noredis` | 应用 + PostgreSQL 16 | 构建期显式关闭 Redis：无 redis 容器/卷；源站页面缓存改用文件驱动（`.nitro/cache`），搜索/足迹等短期缓存与限流计数改用进程内内存 |

> **接了 CDN 边缘缓存就用「不带 Redis」这套**：页面缓存由 CDN 承担。两套都能跑，区别只在缓存后端。

> **`site.config.ts` 的 `build.redis` 在 Docker 部署下不生效**，它只对**裸机部署**负责。两个 Dockerfile 总会把 `REDIS_ENABLED` / `REDIS_HOST` 等设进构建环境，而 [shared/redis-config.ts](../shared/redis-config.ts) 的取值是 `环境变量 ?? site.config`——环境变量一旦有值，`site.config` 就永远不被查。Docker 这边唯一的开关就是选哪套 compose。

## 指定 Redis 参数（可选）

默认连 compose 里的 redis 服务（`redis:6379`、DB 0、无鉴权），**通常不用改**。要改就在**构建命令里用 `--build-arg` 覆盖**，不要改 `site.config.ts`，也不要动 `.env`：

```bash
# 连外部 Redis
docker compose --env-file .env -f docker/docker-compose.yml build --build-arg REDIS_HOST=10.0.0.5 --build-arg REDIS_PORT=6379 --build-arg REDIS_DB=1
```

可用变量：`REDIS_ENABLED` / `REDIS_HOST` / `REDIS_PORT` / `REDIS_DB`（不含密码，见下）。`--build-arg` 优先级高于 compose 里的字面量；改完**必须重新 build** 才生效（值在打包时烘焙进产物）。

> ⚠️ 用 `docker compose build --build-arg ...` 再 `up`，**不要**用 `up --build` —— 后者不接受 `--build-arg`。

> 不支持 Redis 密码（2026-09-14 移除）：密码是唯一要同时喂给 app（构建期）和 redis 服务（运行期）的值，而 `--build-arg` 只管构建期，非对称的口子容易配出一边有一边没有。默认部署的 redis 只在 compose 内网可达（**未发布端口**），不开鉴权。若确需密码，自己给 `redis` 服务加 `--requirepass` 并同步改 `shared/redis-config.ts` 的连接参数。

## 运行时覆盖（意料之外，正常部署不会触发）

烘焙进产物的值**并非绝对不可变**：Nuxt/Nitro 的 `runtimeConfig` 在进程启动时还会再读一遍环境变量，前缀为 `NUXT_`（Nuxt 默认）和 `NITRO_`（Nitropack 内部，**写死、无法关闭**）。键名规则是路径转大写下划线拼接，例如 `redis.host` → `REDIS_HOST`。

所以容器环境里若存在 `NUXT_REDIS_HOST` 或 `NITRO_REDIS_HOST`，会**覆盖**掉构建期烘焙的 host。实测 `docker run -e NUXT_REDIS_HOST=wrong imqi1-cms:latest`，日志会显示连到 `wrong`。正常部署不会有人去设这两个前缀；风险点在于**把外部环境整个灌进容器**（`env_file` / `-e` 透传），此时 `.env` 里的 `NUXT_*` 会被带进去。`REDIS_*` 无前缀变量不受影响（不读）。

## 数据卷与会话

| 卷 | 内容 | 丢了会怎样 |
| --- | --- | --- |
| `imqi1-cms_pg-data` | PostgreSQL 数据（文章、评论、设置、后台附件 COS 密钥…） | 整站数据没了 |
| `imqi1-cms_sessions-data` | 登录会话（`sessionStoreType=file`，**未配置时即默认此值**） | 所有人掉登录态 |
| `imqi1-cms_redis-data` | Redis 持久化（仅带 Redis 版本） | 缓存重新生成，不影响数据 |

`sessions-data` 挂的是容器内 `/app/.sessions`。**不要改成临时目录或去掉这个挂载**：`up -d --build` 会重建容器、连带换掉容器内的文件系统，会话会随镜像重建一起消失。卷里的属主继承自 Dockerfile 预建并 `chown node:node` 的 `/app/.sessions`，所以那行 chown 不能删——否则卷是 root 属主，非 root 的 `node` 用户写不进去（实测 `Permission denied`）。

会话存哪由后台「设置」页的 **Session 存储** 卡片决定（下拉三选一：文件存储 / 数据库存储 / 内存存储），**只有「文件存储」用这个卷**：

- `file`「文件存储」（**DB 里没配过这项时的默认值**）→ 容器内 `/app/.sessions`，即本卷
- `database`「数据库存储」→ PostgreSQL，跟着 `pg-data` 卷走，不碰本卷
- `memory`「内存存储」→ 进程内存，容器一重建就全体掉登录态

所以「从没配过这项」的人其实也在用这个卷，不是只有显式选了「文件存储」才用。

上传与日志目录是 bind mount、不走具名卷：容器内 `/app/.output/public/uploads` 挂到 `.env` 的 `UPLOADS_DIR`（默认项目根 `uploads/`），`/app/logs` 挂到 `LOGS_DIR`（默认项目根 `logs/`）。宿主目录不存在时 Docker 会以 root 属主创建，容器内的 `node` 用户（uid 1000）写不进去——先 `mkdir -p logs uploads && sudo chown 1000:1000 logs uploads`，否则文件日志一直是空的、上传也会失败。

> 两套 compose 的项目名都是 `imqi1-cms`，所以卷名相同：在带/不带 Redis 两套之间切换，PostgreSQL 数据与会话都是共用的。

## 常用运维命令

```bash
# 状态 / 日志（换 docker-compose.noredis.yml 即不带 Redis 版本）
docker compose --env-file .env -f docker/docker-compose.yml ps
docker compose --env-file .env -f docker/docker-compose.yml logs -f app

# 进入 PostgreSQL（用户名 / 库名换成 .env 里的 DB_USER / DB_NAME）
docker compose --env-file .env -f docker/docker-compose.yml exec postgres psql -U imqi1 -d imqi1-cms
```

> ⚠️ `docker compose ... down -v` 会**删除数据卷、清空所有数据**，请谨慎使用。

镜像列表以各 `Dockerfile` / compose 为准：构建 `oven/bun:1.4.4`、运行 `node:24-slim`、数据库 `postgres:16-alpine`、缓存 `redis:8-alpine`。
