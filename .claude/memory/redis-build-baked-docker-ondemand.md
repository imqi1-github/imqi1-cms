---
name: redis-build-baked-docker-ondemand
description: Redis 构建期烘焙进 runtimeConfig+nitro（ISR/搜索共用），运行时零 Redis 环境变量；Docker 拆成 docker/ 两套显式版本（带/不带 Redis），无 COMPOSE_PROFILES 魔法
metadata: 
  node_type: memory
  type: project
  originSessionId: 53ba7575-f6e0-467c-ae59-2592a57a813c
---

Redis 配置全走环境变量（REDIS_*_DEV/_PROD 按 NODE_ENV 分支），但**只读在构建期**：nuxt.config.ts 调 `shared/redis-config.ts` 的 `getRedisConfig()`，把结果烘焙进两处——nitro storage/routeRules（ISR 增量缓存）+ `runtimeConfig.redis`（搜索缓存，server/utils/redis.ts 读 useRuntimeConfig，不再读 process.env）。生产运行时**零** Redis 环境变量；prod 配置缺失时 ISR 退文件系统、搜索缓存关（都 null 不报错）。改 prod 配置必须重新打包。

**Docker 拆成两套显式版本**（是否启用 Redis = 选哪套 compose，**不需要任何 COMPOSE_PROFILES / profiles**）：
- `docker/docker-compose.yml` + `docker/Dockerfile` = 带 Redis（app+mysql+redis 服务+redis-data 卷）。构建 args 里 `REDIS_HOST_PROD: ${REDIS_HOST_PROD:+redis}` —— 宿主 .env 非空即烘焙 compose 服务名 redis（端口 6379、无密码），空则烘焙空串降级（redis 容器仍启动但应用不用）。
- `docker/docker-compose.noredis.yml` + `docker/Dockerfile.noredis` = 不带 Redis（仅 app+mysql，无 redis 服务/卷/构建参数，Dockerfile 也省略 ARG/ENV REDIS 块）。
- 运行命令统一带 `--env-file .env`：compose 挪进 docker/ 子目录后 project dir 变了，`.env` 插值不再从根目录自动读（实测 `docker compose -f docker/... config` 会 warning "variable is not set"）；从根目录 `docker compose --env-file .env -f docker/docker-compose.yml up -d --build`。相对路径 `../` 指项目根（context: .. / env_file: ../.env / ../scripts/init-db.sql，compose 以自身文件目录为基准解析）。
- `.dockerignore` 里 Dockerfile/docker-compose*.yml 模式**必须锚定根目录**（`/Dockerfile`）：docker 的 patternmatcher 按 basename 匹配任意层级，裸模式会把 docker/Dockerfile 也排除出构建上下文导致构建失败。
- 关键理解：`.dockerignore` 排除 .env 只影响**构建上下文**（COPY . .），不影响 compose 的 `${VAR}` 插值和 `env_file` 运行时注入。所以 DB 走运行时注入（DB_* 单套变量、构建不连库），Redis 走构建期烘焙（dev/prod 双套变量）。
- 验证不用 build：`docker compose --env-file .env -f docker/... config`（纯客户端解析，daemon 未运行也可用）。`env_file: ../.env` 会把 REDIS_*_PROD 原样带进容器但惰性（进程不读），无害。
- 相关：[[nodejs-imqi1-db-imqi1-nodejs]]（DB 运行时注入无分支）、[[lint-typecheck-no-root-script]]
