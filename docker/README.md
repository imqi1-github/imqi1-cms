# Docker 部署（两种版本）

本目录提供两套**独立的 Docker 部署文件**，按是否需要 Redis 二选一使用。两套的 `../` 相对路径均指向项目根目录，且都从根目录的 `.env` 读取变量（运行命令统一带 `--env-file .env`）。

| 版本 | 文件 | 服务 | 说明 |
| --- | --- | --- | --- |
| **带 Redis** | `docker-compose.yml` + `Dockerfile` | 应用 + PostgreSQL 16 + Redis 7 | `.env` 填 `REDIS_HOST_PROD=redis` 即烘焙 Redis 连接并启动 redis 容器，ISR 增量缓存与搜索缓存共用；redis 数据存于 `redis-data` 卷 |
| **不带 Redis** | `docker-compose.noredis.yml` + `Dockerfile.noredis` | 应用 + PostgreSQL 16 | 不烘焙任何 Redis 配置：ISR 走文件系统缓存、搜索缓存关闭，无 redis 容器/卷 |

> 注意：`.env` 只保留 `REDIS_*_DEV` / `REDIS_*_PROD` 各四个环境变量即可；**不需要任何 `COMPOSE_PROFILES`**。是否启用 Redis 由「选用哪套 compose 文件」决定，而非环境变量魔法。

## .env 关键变量

运行命令统一从项目根目录的 `.env` 读变量（`--env-file .env`）。至少需设置以下四项：

| 变量 | 说明 |
| --- | --- |
| `DB_PASSWORD` | PostgreSQL 应用用户密码（compose 用它建库并传给 `POSTGRES_PASSWORD`）。PG 不像 MySQL 分 root/普通用户，单用户即超级用户 |
| `DB_NAME` | 库名，compose 建库与导入 `init-db.sql` 都用它 |
| `DB_USER` | 应用连接的用户。**PG 没有 root/普通用户分权**，应用用户与库所有者是同一个；设 `DB_USER=root` 是字面值能跑，但建议沿用普通用户名（如 `nodejs`、`imqi1`）保持与 MySQL 时代同样的命名习惯 |
| `DEPLOY_PORT` | 宿主对外端口（默认 `3000`） |
| `UPLOADS_DIR` | 本地上传目录的**宿主路径**（bind mount）。默认 `../uploads`（即项目根 `uploads/`，本地文件系统直接可见）；容器内挂载点固定为 `/app/.output/public/uploads`。裸机部署则指应用直接写入的目录。不设置即用默认 |

`DB_HOST` 会被 compose 自动覆盖为服务名 `postgres`，无需填写。

## 带 Redis 版本

```bash
docker compose --env-file .env -f docker/docker-compose.yml up -d --build
```

- 宿主 `.env` 的 `REDIS_HOST_PROD` 填 `redis`（compose 服务名，非空即可，值会被强制按服务名解析）→ 把 `redis:6379`（无密码）烘焙进镜像并启动 redis 容器；
- 留空 → 传空串，`getRedisConfig()` 返回 null，ISR 走文件系统、搜索缓存关闭（redis 容器仍会启动，只是应用不使用）。

## 不带 Redis 版本

```bash
docker compose --env-file .env -f docker/docker-compose.noredis.yml up -d --build
```

- 构建时无任何 Redis 环境变量 → ISR 走文件系统缓存、搜索缓存关闭；
- 不创建 redis 容器、不创建 `redis-data` 卷。

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

# 进入 PostgreSQL 命令行（库名以 .env 中的 $DB_NAME 为准；PG 单用户即超级用户，无 root/普通分权）
docker compose --env-file .env -f docker/docker-compose.yml exec postgres psql -U "$DB_USER" -d "$DB_NAME"
```

> ⚠️ `docker compose ... down -v` 会**删除数据卷、清空所有数据**，请谨慎使用。

## 镜像加速

如服务器在国内拉 `postgres:16-alpine` / `oven/bun:1.3.10` / `node:22-slim` 慢，可在 `~/.docker/daemon.json` 加 `registry-mirrors`（按就近原则挑选实际可达的源，本仓库验证 `https://docker.m.daocloud.io` 可用）。镜像列表见各 `Dockerfile` 的 `FROM` 行。