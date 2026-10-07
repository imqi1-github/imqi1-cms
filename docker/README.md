# Docker 部署（两种版本）

本目录提供两套**独立的 Docker 部署文件**，按是否需要 Redis 二选一使用。两套的 `../` 相对路径均指向项目根目录，且都从根目录的 `.env` 读取变量（运行命令统一带 `--env-file .env`）。

| 版本 | 文件 | 服务 | 说明 |
| --- | --- | --- | --- |
| **带 Redis** | `docker-compose.yml` + `Dockerfile` | 应用 + PostgreSQL 16 + Redis 7 | 构建期烘焙 `redis:6379`（compose 服务名）并启动 redis 容器，ISR 增量缓存与搜索缓存共用；redis 数据存于 `redis-data` 卷 |
| **不带 Redis** | `docker-compose.noredis.yml` + `Dockerfile.noredis` | 应用 + PostgreSQL 16 | 构建期显式关闭 Redis：页面不做整页缓存、搜索缓存关闭，无 redis 容器/卷 |

> **`site.config.ts` 的 `build.redis` 在 Docker 部署下不生效**，它只对**裸机部署**负责。两个 Dockerfile 总会把 `REDIS_ENABLED` / `REDIS_HOST` 等设进构建环境，而 [shared/redis-config.ts](../shared/redis-config.ts) 的取值是 `环境变量 ?? site.config`——环境变量一旦有值，`site.config` 就永远不被查。所以把 `build.redis.enabled` 改成 `false` 并不能关掉 Docker 里的 Redis；Docker 这边唯一的开关就是选哪套 compose。

## 指定 Redis 参数（可选）

默认连的就是 compose 里的 redis 服务（`redis:6379`、DB 0、无鉴权），**通常不用改**。要改的话在**构建命令里用 `--build-arg` 覆盖**，不要改 `site.config.ts`，也不要动 `.env`：

```bash
# 连外部 Redis
docker compose --env-file .env -f docker/docker-compose.yml build --build-arg REDIS_HOST=10.0.0.5 --build-arg REDIS_PORT=6379 --build-arg REDIS_DB=1
```

可用变量：`REDIS_ENABLED` / `REDIS_HOST` / `REDIS_PORT` / `REDIS_DB`（不含密码，见下）。`--build-arg` 优先级高于 compose 里的字面量。改完**必须重新 build** 才生效（值在打包时烘焙进产物）。

> ⚠️ 用 `docker compose build --build-arg ...` 再 `up`，**不要**用 `up --build` —— 后者不接受 `--build-arg`。

> 不支持 Redis 密码（2026-09-14 移除）：密码是唯一要同时喂给 app（构建期）和 redis 服务（运行期）的值，而 `--build-arg` 只管构建期，非对称的口子容易配出一边有一边没有。当前默认部署的 redis 只在 compose 内网可达（**未发布端口**），不开鉴权。若确需密码，自己给 `redis` 服务加 `--requirepass` 并同步改 `shared/redis-config.ts` 的连接参数。

## 运行时覆盖（意料之外，正常部署不会触发）

烘焙进产物的值**并非绝对不可变**：Nuxt/Nitro 的 `runtimeConfig` 在进程启动时还会再读一遍环境变量，前缀为 `NUXT_`（Nuxt 默认）和 `NITRO_`（Nitropack 内部，**写死、无法关闭**）。键名规则是路径转大写下划线拼接，例如 `redis.host` → `REDIS_HOST`。

所以容器环境里若存在 `NUXT_REDIS_HOST` 或 `NITRO_REDIS_HOST`，会**覆盖**掉构建期烘焙的 host。实测 `docker run -e NUXT_REDIS_HOST=wrong imqi1-cms:latest`，日志会显示连到 `wrong`。

正常部署不会有人去设这两个前缀。风险点在于**把外部环境整个灌进容器**（`env_file` / `-e` 透传），此时 `.env` 里的 `NUXT_*` 会被带进去。`REDIS_*` 无前缀变量不受影响（不读）。

## .env 关键变量

运行命令统一从项目根目录的 `.env` 读变量（`--env-file .env`）。**三项必填，两项可选**：

| 变量 | 说明 |
| --- | --- |
| `DB_PASSWORD` | PostgreSQL 应用用户密码（compose 用它建库并传给 `POSTGRES_PASSWORD`）。PG 不像 MySQL 分 root/普通用户，单用户即超级用户 |
| `DB_NAME` | 库名，compose 建库与导入 `init-db.sql` 都用它 |
| `DB_USER` | 应用连接的用户。**PG 没有 root/普通用户分权**，应用用户与库所有者是同一个；设 `DB_USER=root` 是字面值能跑，但建议沿用普通用户名（如 `nodejs`、`imqi1`）保持与 MySQL 时代同样的命名习惯 |
| `DEPLOY_PORT` | 宿主对外端口（默认 `3000`）。**可不填**——compose 有默认值 |
| `UPLOADS_DIR` | 本地上传目录的**宿主路径**（bind mount）。默认 `../uploads`（即项目根 `uploads/`，本地文件系统直接可见）；容器内挂载点固定为 `/app/.output/public/uploads`。裸机部署则指应用直接写入的目录。**可不填**——compose 有默认值 |
| `LOGS_DIR` | 日志目录的**宿主路径**（bind mount）。默认 `../logs`（即项目根 `logs/`）；容器内挂载点固定为 `/app/logs`。裸机部署的日志目录由 `LOG_DIR` / `site.config.ts` 决定，与此变量无关。**可不填**——compose 有默认值 |

> 前三个**实质必填**：compose 虽然给 postgres 容器兜了默认值，但 app 容器是从 `env_file: ../.env` 取 DB_\* 的，`.env` 里没有就两边对不上、app 连不上库。后两个只影响 compose 自身，有默认值即可。

`DB_HOST` 会被 compose 自动覆盖为服务名 `postgres`，无需填写。

## 带 Redis 版本

```bash
docker compose --env-file .env -f docker/docker-compose.yml up -d --build
```

- 构建期烘焙 `REDIS_ENABLED=true` + `REDIS_HOST=redis`（compose 服务名）→ 把 `redis:6379`（DB 0、无鉴权）烘焙进镜像并启动 redis 容器；
- 想连别处的 Redis：见上文「指定 Redis 参数」，用 `--build-arg` 覆盖，改完重新 build。

## 不带 Redis 版本

```bash
docker compose --env-file .env -f docker/docker-compose.noredis.yml up -d --build
```

- 构建期烘焙 `REDIS_ENABLED=false` → `getRedisConfig()` 返回 null，页面整页缓存与搜索缓存关闭；
- 不创建 redis 容器、不创建 `redis-data` 卷。
- 这个开关不能省：`site.config.ts` 的 `build.redis.enabled` 默认为 `true`，不显式关掉的话容器会去连 `host` 默认值 `127.0.0.1`（即容器自己），一直连不上。

## 验证

```bash
docker compose --env-file .env -f docker/docker-compose.yml config          # 查看解析后的完整配置
docker compose --env-file .env -f docker/docker-compose.yml config --services
docker compose --env-file .env -f docker/docker-compose.noredis.yml config --services
```

## 常用运维命令

```bash
# 查看状态 / 日志（以带 Redis 版本为例，不带 Redis 把文件名换掉即可）
docker compose --env-file .env -f docker/docker-compose.yml ps
docker compose --env-file .env -f docker/docker-compose.yml logs -f app

# 重启 / 停止
docker compose --env-file .env -f docker/docker-compose.yml restart app
docker compose --env-file .env -f docker/docker-compose.yml down   # 数据卷保留

# 进入 PostgreSQL 命令行（用户名/库名换成你 .env 里的 DB_USER / DB_NAME；PG 单用户即超级用户）
docker compose --env-file .env -f docker/docker-compose.yml exec postgres psql -U imqi1 -d imqi1-cms
```

> ⚠️ `docker compose ... down -v` 会**删除数据卷、清空所有数据**，请谨慎使用。

## 数据卷

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

日志与上传目录一样是 bind mount、不走具名卷：容器内 `/app/logs` 默认挂到项目根 `logs/`，宿主路径用 `.env` 的 `LOGS_DIR` 改。宿主目录不存在时 Docker 会以 root 属主创建，容器内的 `node` 用户（uid 1000）写不进去——先 `mkdir -p logs && sudo chown 1000:1000 logs`，否则文件日志一直是空的，只剩容器终端输出（`docker compose logs app` 仍能看到）。

> 两套 compose 的项目名都是 `imqi1-cms`，所以卷名相同：在带/不带 Redis 两套之间切换，PostgreSQL 数据与会话都是共用的。

## 镜像加速

如服务器在国内拉 `postgres:16-alpine` / `oven/bun:1.4` / `node:22-slim` 慢，可在 `~/.docker/daemon.json` 加 `registry-mirrors`（按就近原则挑选实际可达的源，本仓库验证 `https://docker.m.daocloud.io` 可用）。镜像列表见各 `Dockerfile` 的 `FROM` 行。