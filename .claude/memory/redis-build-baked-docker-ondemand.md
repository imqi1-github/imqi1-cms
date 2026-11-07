---
name: redis-build-baked-docker-ondemand
description: Redis 配置源头是 site.config.ts 的 build.redis（构建期烘焙进 runtimeConfig + nitro storage，开发环境恒 null）；Docker 两套显式 compose 即开关；Redis 开关的影响面（页面缓存不受影响，只换短期缓存与限流的后端）
metadata:
  type: project
---

# Redis 配置源头、构建期烘焙与开关影响面

## 一、配置源头与烘焙

- 默认值写在 **`site.config.ts` 的 `build.redis`**（`enabled` / `host` / `port` / `db`，**无 password 支持**），**没有任何 `REDIS_*_DEV/PROD` 环境变量**。
- `shared/redis-config.ts` 的 `getRedisConfig()`：
  - **只在生产生效**（`NODE_ENV !== "production"` → 恒 null，开发环境不启用 Redis）；
  - 取值优先级 = **构建期环境变量**（`REDIS_ENABLED`/`REDIS_HOST`/`REDIS_PORT`/`REDIS_DB`，**空串视为未覆盖**，数值项要显式排除 `Number("")===0`）**> site.config**；
  - `enabled` 为假或 host 为空 → 返回 null。
- 烘焙进两处（**构建期常量，改配置必须重新 build + 重新部署**）：
  1. `nuxt.config.ts` 的 `nitro.storage`（`redis` 挂载 + `cache` 挂载的驱动选择）+ `routeRules` 的 `cache.base`；
  2. `runtimeConfig.redis`（`server/utils/redis.ts` 读 `useRuntimeConfig().redis`，**运行时不读 `REDIS_*`**）。
- `enabled` 这个显式开关是必需的：host 在 site.config 里恒有值（默认 `127.0.0.1`），必须另有关断位。
- **烘焙 ≠ 不可变**：启动时 Nuxt/Nitro 还会读环境变量，前缀 `NUXT_`（Nuxt 默认）与 `NITRO_`（nitropack 里**写死、无法关闭**），键名 = 路径转大写下划线（`redis.host` → `REDIS_HOST`）。⚠️ 把外部环境整个灌进容器（`env_file`/`-e` 透传）会带进 `.env` 里的 `NUXT_*`；无前缀的 `REDIS_*` 不受影响。

## 二、Docker 两套显式版本（**不需要 COMPOSE_PROFILES**）

是否启用 Redis **只由选哪套 compose 文件决定**：

- `docker/docker-compose.yml` + `docker/Dockerfile` = 带 Redis（app + postgres + redis 服务 + redis-data 卷）。Dockerfile builder stage：`ARG REDIS_ENABLED=true` / `REDIS_HOST=redis` → `ENV` 落到构建期。
- `docker/docker-compose.noredis.yml` + `docker/Dockerfile.noredis` = 不带 Redis，**builder stage 必须有 `ENV REDIS_ENABLED=false`**（省掉 → site.config 默认值生效 → 容器去连 `127.0.0.1`（自己）并一直失败）。
- **compose 的 `build.args` 写固定字面量**，不用 `${REDIS_*:-默认}` 插值（插值会读 `--env-file .env`，残留的 `REDIS_*` 会静默改变构建结果）。改参数用 CLI `--build-arg`（能压过字面量）；⚠️ `up --build` **不接受** `--build-arg`，得先 `docker compose build --build-arg ...` 再 `up`。
- 运行统一：`docker compose --env-file .env -f docker/docker-compose.yml up -d --build`（compose 在子目录后 `.env` 不再自动读；相对路径以 compose 所在目录为基准）。
- `.dockerignore` 里 Dockerfile 模式**必须锚定根目录**（`/Dockerfile`）——patternmatcher 按 basename 匹配任意层级，裸模式会把 `docker/Dockerfile` 排除出构建上下文。
- `.dockerignore` 排除 `.env` 只影响构建上下文，不影响 compose 的 `${VAR}` 插值与 `env_file` 注入 ⇒ **DB 走运行时注入，Redis 走构建期烘焙**。
- 非 Redis 时的 ISR 文件缓存 `.nitro/cache` **故意不挂卷**（是缓存，重建后重新生成才对）。

## 三、Redis 开关的影响面（当前源码事实）

| 能力 | Redis 开 | Redis 关 | 影响内容？ |
|---|---|---|---|
| 源站页面/API 缓存（routeRules `cache`） | redis 驱动 | 文件驱动 `.nitro/cache` | ❌ 都不影响（两种驱动都在） |
| 短期缓存（搜索/足迹聚合/点赞/错误去重） | Redis | 进程内内存（`server/utils/cache/memory-store.ts`，上限 1 万条、随进程重启清零） | ❌ TTL 相同 |
| 限流 / 登录锁定 | Redis 共享（跨进程、跨重启） | 进程内（每进程一份、重启清零） | ⚠️ 单实例无差别；多副本时被稀释 N 倍 |
| `/search` 页的源站缓存 | 有（30 分钟） | **没有**（每次实查库 + SSR） | ⚠️ 结果相同，只是慢 |
| 启动清缓存 | `redis.flushdb()`（清**整个 db0**） | `useStorage("cache").clear()` | ⚠️ 同库的其他数据会被一起清掉 |
| 会话存储 | 与 Redis 无关（`sessionStoreType` = file / database） | 同 | ❌ |

⇒ **Redis 开关不改变页面内容**，只换短期缓存与限流的后端；页面缓存这一层两种驱动等价（失效逻辑刻意做成驱动无关，见 [[nitro-source-cache-layer]]）。

⚠️ **「Redis 配了但连不上」≠「Redis 关」**：缓存与限流都 catch 后回落内存（功能正确），但每次访问先等 ioredis 的 connectTimeout（默认 10s）+ 3 次重试 → **比根本不配 Redis 更慢**，且日志刷屏。要关就改配置重建。

## 四、验证

- 不必 build 验证解析结果：`NODE_ENV=production bun -e 'console.log((await import("./shared/redis-config.ts")).getRedisConfig())'`（配 `REDIS_HOST=...` 等变量看覆盖效果）。
- compose 解析：`docker compose --env-file .env -f docker/... config`（纯客户端解析，daemon 不运行也可用）。
- 源站缓存落盘位置：无 Redis → `.nitro/cache/nitro/routes/_/<frag>.<hash>.json`；有 Redis → `nitro:routes:_:<frag>.<hash>.json`。

相关：[[cdn-edgeone-purge-and-cache-migration]]、[[nitro-source-cache-layer]]、[[post-change-lint-chain]]
