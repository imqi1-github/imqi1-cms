# Docker 部署（两种版本）

本目录提供两套**独立的 Docker 部署文件**，按是否需要 Redis 二选一使用。两套的 `../` 相对路径均指向项目根目录，且都从根目录的 `.env` 读取变量（运行命令统一带 `--env-file .env`）。

| 版本 | 文件 | 服务 | 说明 |
| --- | --- | --- | --- |
| **带 Redis** | `docker-compose.yml` + `Dockerfile` | 应用 + MySQL 8 + Redis 7 | `.env` 配置了 `REDIS_HOST_PROD`（非空）即烘焙 Redis 连接，ISR 增量缓存与搜索缓存共用；redis 数据存于 `redis-data` 卷 |
| **不带 Redis** | `docker-compose.noredis.yml` + `Dockerfile.noredis` | 应用 + MySQL 8 | 不烘焙任何 Redis 配置：ISR 走文件系统缓存、搜索缓存关闭，无 redis 容器/卷 |

> 注意：`.env` 只保留 `REDIS_*_DEV` / `REDIS_*_PROD` 各四个环境变量即可；**不需要任何 `COMPOSE_PROFILES`**。是否启用 Redis 由「选用哪套 compose 文件」决定，而非环境变量魔法。

## 带 Redis 版本

```bash
docker compose --env-file .env -f docker/docker-compose.yml up -d --build
```

- 宿主 `.env` 的 `REDIS_HOST_PROD` 非空 → 把 compose 服务名 `redis`（端口 6379、无密码）烘焙进镜像，启动 redis 容器；
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

# 进入 MySQL 命令行（库名以 .env 中的 $DB_NAME 为准）
docker compose --env-file .env -f docker/docker-compose.yml exec mysql mysql -uroot -p"$DB_PASSWORD" "$DB_NAME"
```

> ⚠️ `docker compose ... down -v` 会**删除数据卷、清空所有数据**，请谨慎使用。
