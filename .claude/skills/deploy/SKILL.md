---
name: deploy
description: 构建并上传到云端：bun run build + upload:cos + upload:server。**先校验 .env 里 COS/SERVER 上传配置是否齐全（缺即停）**；注意 upload:cos 有交互式「清空远程目录 yes/no」确认，bash 工具喂不了 stdin 会挂起，需用户手动跑 `! bun run upload:cos` 或显式授权后再由 Claude 接管。每次改动后要发版部署时使用。
---

# /deploy — 构建并上传到云端

目标：把本地最新代码构建成产物，上传到腾讯云 COS（静态资源）与自建服务器（Nitro server）。**这是对外发布动作，每一步都先确认。**

**关键：upload:server 会因缺少 `SERVER_HOST` 等直接 `exit(1)`；upload:cos 则有一个交互式「清空远程目录」确认，Claude 在 bash 工具里无法输入，会永久挂起。** 本流程必须先校 env、并对交互式步骤做安全处理。

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
> **当前 .env 实测**：`COS_*` 四项已配置，但 `SERVER_HOST` 为空、`SERVER_USER` 为空（将用默认 root）——若用户尚未补 `SERVER_HOST`，本步会拦下并提示。

## 2. 构建
```bash
bun run build
```
> prebuild（生成 hash）→ `nuxt build` → postbuild（拷数据/更新 SW）。产出 `.output/server`（Nitro）+ `.output/public`（静态资源）。任一上传脚本若无对应产物会 `exit(1)`，故**必须等构建成功**再上传。构建失败 → 停下，不要上传。

## 3. 上传到服务器（非交互，可 Claude 直接跑）
```bash
bun run upload:server
```
> 上传 `.output/server` 到 `SERVER_HOST`，默认跳过 `node_modules`（加 `--node-modules` 才上传）。连不上/失败时把报错贴出。

## 4. 上传到 COS（⚠️ 交互式，Claude 在 bash 里会挂起）
`upload:cos` 内置 `readline` 问「是否清空远程目录 yes/no」**，bash 工具无 stdin → 永久等待**。两种处理，**默认走 A（安全）**：

**A. 交回给用户（默认）**：上传前贴出说明，让用户自己跑：
```
! bun run upload:cos
```
> 用户可当面回答 yes/no。**推荐**：先 `n` 不清空，或确认清空后再 `y`（对应上传前缀下的老 hash 产物）。

**B. 用户显式授权 Claude 代跑**：仅在用户明确说「你来跑并选 y/n」时，把答案喂进 stdin：
```bash
echo "y" | bun run upload:cos   # 或 echo "n" | ...
```
> 动用 `y`（清空远程目录）前**务必用户拍板**；这涉及删除远端历史产物，不可逆。

## 5. 汇报
- 各步退出码非 0 → 原样贴出报错，别吞。
- 全绿 → 一行「✓ 构建 + upload:server + upload:cos 完成」，并提醒静态资源走 CDN 回源、Nitro 由 `SERVER_HOST` 承载。
- 可选下一步：`bun run restart:server`（重载生产 node 进程；需 `BT_PANEL_URL/BT_API_KEY/BT_PROJECT_NAME`，当前 .env 未配置——需用户补充才可用）。
- **边界**：本 skill 只跑 build + 两个 upload；不碰 DB、不跑 migrate；上传属对外动作，未确认不下刀。
