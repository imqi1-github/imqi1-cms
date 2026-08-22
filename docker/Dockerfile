# syntax=docker/dockerfile:1

# 带 Redis 版本，与 docker-compose.yml 配套。构建期烘焙 REDIS_*_PROD（由 compose build.args
# 传入，宿主 .env 的 REDIS_HOST_PROD 非空即启用）；留空则 getRedisConfig() 返回 null，
# ISR 走文件系统缓存、搜索缓存关闭。生产容器内运行时无 Redis 环境变量。

# ---- Stage 1: 依赖安装 + 构建 ----
FROM oven/bun:1.3.10 AS builder
WORKDIR /app
COPY . .
RUN bun install --frozen-lockfile --ignore-scripts
RUN bunx prisma generate

# Redis 构建期烘焙
ARG REDIS_HOST_PROD=
ARG REDIS_PORT_PROD=6379
ARG REDIS_PASSWORD_PROD=
ARG REDIS_DB_PROD=0
ENV REDIS_HOST_PROD=${REDIS_HOST_PROD} \
    REDIS_PORT_PROD=${REDIS_PORT_PROD} \
    REDIS_PASSWORD_PROD=${REDIS_PASSWORD_PROD} \
    REDIS_DB_PROD=${REDIS_DB_PROD}

RUN bun run build

# ---- Stage 2: 运行时 ----
FROM node:22-slim AS runner
WORKDIR /app
ENV NODE_ENV=production \
    NITRO_PRESET=node-server \
    NITRO_HOST=0.0.0.0 \
    NITRO_PORT=3000 \
    PORT=3000

COPY --from=builder /app/.output ./.output

# 覆盖被裁剪的 undici：Nitro/nft 对 undici trace 不完整，缺 index.js 会导致
# isomorphic-dompurify 运行时 require("undici") 失败。勿删。
COPY --from=builder /app/node_modules/undici ./.output/server/node_modules/undici

# 预建运行时写入目录并交给非 root 的 node 用户（root 写入的内容 node 无法再写）。
# 上传目录固定为 /app/.output/public/uploads（compose bind mount 挂载点）。
RUN mkdir -p /app/.nitro/cache /app/.data/storage /app/.output/public/uploads /app/.sessions /app/logs/mail \
    && chown -R node:node /app/.nitro /app/.data /app/.output/public/uploads /app/.sessions /app/logs

USER node
EXPOSE 3000
CMD ["node", ".output/server/index.mjs"]
