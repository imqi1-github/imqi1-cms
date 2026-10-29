# syntax=docker/dockerfile:1

# 带 Redis 版本，与 docker-compose.yml 配套；参数用 --build-arg 覆盖

# ---- Stage 1: 依赖安装 + 构建 ----
# 匹配 package.json 的 packageManager，避免 bun 版本不一致导致 --frozen-lockfile 失败
FROM oven/bun:1.4.4 AS builder
WORKDIR /app
COPY . .
RUN bun install --frozen-lockfile --ignore-scripts
RUN bunx prisma generate

# Redis 构建期烘焙（固定值，用 --build-arg 覆盖；见 docker/README.md）
ARG REDIS_ENABLED=true
ARG REDIS_HOST=redis
ARG REDIS_PORT=6379
ARG REDIS_DB=0
ENV REDIS_ENABLED=${REDIS_ENABLED} \
    REDIS_HOST=${REDIS_HOST} \
    REDIS_PORT=${REDIS_PORT} \
    REDIS_DB=${REDIS_DB}

RUN bun run build

# ---- Stage 1.5: 纯导出（仅 buildkit --output 使用，不进最终镜像）----
# 传 --target bundle --output type=local,dest=. 可把 .output 导出到宿主，无需 docker cp
FROM scratch AS bundle
COPY --from=builder /app/.output /output

# ---- Stage 2: 运行时 ----
FROM node:24-slim AS runner
WORKDIR /app
ENV NODE_ENV=production \
    NITRO_PRESET=node-server \
    NITRO_HOST=0.0.0.0 \
    NITRO_PORT=3000 \
    PORT=3000

COPY --from=builder /app/.output ./.output

# 补 nft 裁剪掉的 undici，否则 isomorphic-dompurify 运行时 require("undici") 失败。勿删
COPY --from=builder /app/node_modules/undici ./.output/server/node_modules/undici

# 预建运行时目录并 chown 给 node（root 建的 node 写不进去）
RUN mkdir -p /app/.nitro/cache /app/.data/storage /app/.output/public/uploads /app/.sessions /app/logs/mail \
    && chown -R node:node /app/.nitro /app/.data /app/.output/public/uploads /app/.sessions /app/logs

USER node
EXPOSE 3000
CMD ["node", ".output/server/index.mjs"]
