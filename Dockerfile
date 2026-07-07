# syntax=docker/dockerfile:1

# ============================================================
# Stage 1: 依赖安装 + 构建（使用 Bun）
# ============================================================
FROM oven/bun:1.3.10 AS builder

WORKDIR /app

COPY . .

# postinstall 会执行 `nuxt prepare`，需要部分源码存在才不报错；
# 这里用 --ignore-scripts 先装依赖，稍后手动 prepare/generate。
RUN bun install --frozen-lockfile --ignore-scripts

# 复制其余源码

# 生成 Prisma Client（mariadb 驱动适配器为纯 JS，无需原生引擎二进制）
# 并执行 nuxt prepare 生成 .nuxt 类型
RUN bunx prisma generate

# 构建 Nuxt（prebuild 生成 build hash，postbuild 拷贝 qqwry.ipdb/字体/wasm 到 .output）
RUN bun run build

# ============================================================
# Stage 2: 运行时（精简 Node 镜像，只带自包含的 .output）
# ============================================================
FROM node:22-slim AS runner

WORKDIR /app

ENV NODE_ENV=production \
    NITRO_PRESET=node-server \
    NITRO_HOST=0.0.0.0 \
    NITRO_PORT=3000 \
    PORT=3000

# 本地上传目录，需与 compose 的 UPLOADS_DIR / 卷挂载点保持一致。
# 通过 build ARG 传入，使下方预建 + chown 的目录随之动态变化；
# 默认沿用 .output/public/uploads（由 Nitro 静态服务直接提供）。
ARG UPLOADS_DIR=/app/.output/public/uploads
ENV UPLOADS_DIR=${UPLOADS_DIR}

# node-server preset 产出的 .output 已是自包含（含 traced node_modules 与运行时数据）
COPY --from=builder /app/.output ./.output

# 修复：Nitro/nft 对 undici 的 trace 不完整（缺 index.js），导致 jsdom
# （isomorphic-dompurify 的服务端依赖）运行时 require("undici") 失败。
# 用 builder 中完整的 undici 覆盖被裁剪的版本。
COPY --from=builder /app/node_modules/undici ./.output/server/node_modules/undici

# 运行时需要写入的目录（均以 process.cwd()=/app 为根）。
# /app 及其内容由 root 通过 COPY 写入，非 root 的 node 用户无法在其中新建文件/目录，
# 直接写会报 EACCES/ENOENT。这里预先创建并把所有权交给 node：
#   .nitro/cache            —— ISR / fs 缓存
#   .data/storage           —— fs 存储
#   ${UPLOADS_DIR}          —— 本地上传目录（同时是 compose 具名卷挂载点，
#                              首次挂载继承 node 属主，保证能写入用户上传文件）；
#                              路径由 build ARG 决定，改 UPLOADS_DIR 时会一并预建 + chown
#   .sessions               —— Session 文件存储（sessionStoreType=file 时启用）
#   logs/mail               —— 邮件发送日志（emailLogEnabled 开启时写入）
RUN mkdir -p /app/.nitro/cache /app/.data/storage "${UPLOADS_DIR}" /app/.sessions /app/logs/mail \
    && chown -R node:node /app/.nitro /app/.data "${UPLOADS_DIR}" /app/.sessions /app/logs

# 以非 root 用户运行
USER node

EXPOSE 3000

CMD ["node", ".output/server/index.mjs"]
