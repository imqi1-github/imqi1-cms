# syntax=docker/dockerfile:1

# ============================================================
# Stage 1: 依赖安装 + 构建（使用 Bun）
# ============================================================
FROM oven/bun:1.3.10 AS builder

WORKDIR /app

# 先只复制依赖清单，最大化利用 Docker 层缓存
COPY package.json bun.lock ./

# postinstall 会执行 `nuxt prepare`，需要部分源码存在才不报错；
# 这里用 --ignore-scripts 先装依赖，稍后手动 prepare/generate。
RUN bun install --frozen-lockfile --ignore-scripts

# 复制其余源码
COPY . .

# 生成 Prisma Client（mariadb 驱动适配器为纯 JS，无需原生引擎二进制）
# 并执行 nuxt prepare 生成 .nuxt 类型
RUN bunx prisma generate \
    && bunx nuxt prepare

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

# node-server preset 产出的 .output 已是自包含（含 traced node_modules 与运行时数据）
COPY --from=builder /app/.output ./.output

# 以非 root 用户运行
USER node

EXPOSE 3000

CMD ["node", ".output/server/index.mjs"]
