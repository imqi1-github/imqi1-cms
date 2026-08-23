---
name: deploy
description: 构建并上传到云端：bun run build + upload:cos + upload:server。**先校验 .env 里 COS/SERVER 上传配置是否齐全（缺即停）**；upload:cos 有交互式「清空远程目录 yes/no」——Claude 用 `printf 'y\n' | bun run upload:cos` 喂 stdin 即可代跑，不会挂起，但 y 会清空全站远程产物（不可逆），必须先向用户取明确 y/n。每次改动后要发版部署时使用。
---

# /deploy — 构建并上传到云端

目标：把本地最新代码构建成产物，上传到腾讯云 COS（静态资源）与自建服务器（Nitro server）。**这是对外发布动作，每一步都先确认。**

**关键：upload:server 会因缺少 `SERVER_HOST` 等直接 `exit(1)`；upload:cos 有一个交互式「清空远程目录 yes/no」——Claude 可用 `printf 'y\n' |` / `printf 'n\n' |` 向 stdin 喂答案代跑，**不会挂起**；但 `y` 会清空 `COS_PREFIX`（默认 `/`=全站）下全部远程产物（不可逆），必须先向用户取明确 y/n。** 本流程必须先校 env，并对 y 这类破坏性选择做硬确认。

## 0. 前置确认
- 这一步会**覆盖线上产物**。开始前向用户复述「将执行 build + 上传 COS + 上传服务器」，确认无异议再动手。
- `upload:cos` 的「清空远程目录」默认会**清空对应前缀下全部远程文件**，务必让用户知道。

## 1. 校验项目根 + 环境变量（缺即停，不要往下跑）
```bash
ROOT="$(git rev-parse --show-toplevel 2>/dev/null || echo "$PWD")"
cd "$ROOT" || exit 1
echo "项目根: $ROOT"

# TODO 收集缺失项
missing=()
# COS 必备四项
for v in COS_SECRET_ID COS_SECRET_KEY COS_BUCKET COS_REGION; do
  grep -qE "^$v=.+" .env 2>/dev/null || missing+=("$v")
done
# 服务器：host（可用新名 SERVER_HOST 或旧名 SERVER_IP），password，remoteDir
grep -qE '^SERVER_HOST=.+' .env 2>/dev/null || grep -qE '^SERVER_IP=.+' .env 2>/dev/null || missing+=("SERVER_HOST(或 SERVER_IP)")
grep -qE '^SERVER_PASSWORD=.+' .env 2>/dev/null || missing+=("SERVER_PASSWORD")
grep -qE '^SERVER_UPLOAD_DIR=.+' .env 2>/dev/null || missing+=("SERVER_UPLOAD_DIR")

if [ ${#missing[@]} -gt 0 ]; then
  echo "✗ 缺少必填上传配置，请先补 .env："
  printf '   - %s\n' "${missing[@]}"
  exit 1
fi
echo "✓ COS / 服务器上传配置齐全"
```
> 参考：`SERVER_USER`/`SERVER_PORT` 缺省时脚本用 `root` / `22`（`SERVER_USERNAME`、`SERVER_USER` 为旧别名）；`COS_PREFIX`、`SERVER_UPLOAD_CONCURRENCY`、`COS_CONCURRENCY` 可省。
> **当前 .env 实测**：`COS_*` 四项 + `SERVER_HOST/SERVER_PASSWORD/SERVER_UPLOAD_DIR` 均已配置；`SERVER_USER` 缺省用 `root`、`SERVER_PORT`=22、`COS_PREFIX`=`/`（全站）、`COS_CONCURRENCY`=50。缺任一项本步即拦下提示。

## 2. 构建
```bash
bun run build
```
> prebuild（生成 hash）→ `nuxt build` → postbuild（拷数据/更新 SW）。产出 `.output/server`（Nitro）+ `.output/public`（静态资源）。任一上传脚本若无对应产物会 `exit(1)`，故**必须等构建成功**再上传。构建失败 → 停下，不要上传。
> **CDN 只影响 postbuild、不影响上传**：`scripts/update-sw-cdn.mjs` 视 `site.config.ts` 的 `_cdnUrl`（需为 http(s)）决定是否把 sw.js 预缓存路径改写为 CDN 绝对地址；未配置 → 跳过改写、sw.js 走同源相对路径（仍会拷 sw.js/robots.txt 到 server 根）。`upload:cos` 与 CDN 无关。

## 3. 上传到服务器（非交互，可 Claude 直接跑）
```bash
bun run upload:server
```
> 上传 `.output/server` 到 `SERVER_HOST`，默认跳过 `node_modules`（加 `--node-modules` 才上传）。连不上/失败时把报错贴出。

## 4. 上传到 COS（⚠️ 交互式「清空远程目录」，Claude 可代跑但 y/n 须用户定）
`upload:cos` 内置 `readline` 问「是否清空远程目录 yes/no」。Claude 用管道喂 stdin 即可代跑，**不会挂起**；关键是把 **y/n 的选择权留给用户**——`y` 会清空 `COS_PREFIX`（默认 `/`=全站）下全部远程产物，不可逆。

> `upload:cos` **不依赖 CDN 配置**：只要 COS 凭据齐即上传 `.output/public` 构建 chunk（.js/.css 及 .br/.gz 变体 + `builds/` 懒加载元数据）到 hash 前缀；CDN（`_cdnUrl`）只在 postbuild 影响 sw.js 路径改写，**不是上传前提**。CDN 未配置时 `upload:cos` 照常跑。

1. **先向用户取明确答案**（用 AskUserQuestion 给 n/y 两项，并直接点明 y 的破坏性）：默认可推荐 `n`（增量覆盖，安全）；仅当用户主动要彻底清空老 hash 产物时才选 `y`。
2. 拿到答案后喂进 stdin 代跑：
   ```bash
   printf 'y\n' | bun run upload:cos   # 或 printf 'n\n' | ...
   ```
3. 核对退出码：非 0 → 原样贴报错，别吞；成功后提示静态资源走 CDN 回源。

> 若用户坚持自己跑，可贴 `! bun run upload:cos` 让其当面回答；但 Claude 无需再假设「喂不了 stdin」。

## 5. 汇报
- 各步退出码非 0 → 原样贴出报错，别吞。
- 全绿 → 一行「✓ 构建 + upload:server + upload:cos 完成」，并提醒静态资源走 CDN 回源、Nitro 由 `SERVER_HOST` 承载。
- 可选下一步：`bun run restart:server`（重载生产 node 进程；需 `BT_PANEL_URL/BT_API_KEY/BT_PROJECT_NAME`，当前 .env 未配置——需用户补充才可用）。
- **边界**：本 skill 只跑 build + 两个 upload；不碰 DB、不跑 migrate；上传属对外动作，未确认不下刀。
