---
name: deploy
description: 构建并上传到云端：bun run build + upload:server + upload:cos + restart:server。**先校验 .env 里 COS/SERVER/BT 配置是否齐全（缺即停）**；upload:cos 有交互式「清空远程目录 yes/no」，新 hash 部署默认 `n`（远程 static/<hash> 为空时 n/y 都照常上传），脚本通过 stdin 喂入代跑。每次改动后要发版部署时使用。
---

# /deploy — 构建并上传到云端（4 步：build → upload:server → upload:cos → restart:server）

目标：把本地最新代码构建成产物，上传到腾讯云 COS（静态资源）+ 自建服务器（Nitro server），最后通过宝塔面板 API 重启生产 Node 进程。**这是对外发布动作，每一步都先确认。**

**关键约束：**
- `upload:server` 缺 `SERVER_*` 配置会直接 `exit(1)`；`upload:cos` 缺 `COS_*` 同理；`restart:server` 缺 `BT_*` 同理。
- `upload:cos` 有交互式「清空远程目录 yes/no」。**默认喂 `n`**：每次生产 build 都是新 hash，远程 `static/<hash>` 为空 → n/y 都命中"远程目录为空，无需清空"→ 照常上传。**`n` 在前缀已有文件时才会取消整个上传**（重复部署同 hash 或未配 CDN 才可能命中）；脚本用 `printf 'n\n' |` 喂 stdin。
- `restart:server` 通过宝塔 `/mod/nodejs/com/set_project_status` 接口操作 Node 项目；默认 `restart`，可加 `-- start/stop`。
- 4 步链式：build → server → cos → restart。**任一失败就停下**（build 失败不上传；上传失败不重启——避免半新半旧版本被重启到线上）。

## 0. 前置确认
- 这一步会**覆盖线上产物**。开始前向用户复述「将执行 build + upload:server + upload:cos + restart:server」，确认无异议再动手。

## 1. 校验项目根 + 环境变量（缺即停，不要往下跑）
```bash
ROOT="$(git rev-parse --show-toplevel 2>/dev/null || echo "$PWD")"
cd "$ROOT" || exit 1
echo "项目根: $ROOT"

missing=()
# COS 必备四项
for v in COS_SECRET_ID COS_SECRET_KEY COS_BUCKET COS_REGION; do
  grep -qE "^$v=.+" .env 2>/dev/null || missing+=("$v")
done
# 服务器
grep -qE '^SERVER_HOST=.+' .env 2>/dev/null || missing+=("SERVER_HOST")
grep -qE '^SERVER_PASSWORD=.+' .env 2>/dev/null || missing+=("SERVER_PASSWORD")
grep -qE '^SERVER_UPLOAD_DIR=.+' .env 2>/dev/null || missing+=("SERVER_UPLOAD_DIR")
# 宝塔（restart:server 必需）
grep -qE '^BT_PANEL_URL=.+' .env 2>/dev/null || missing+=("BT_PANEL_URL")
grep -qE '^BT_API_KEY=.+' .env 2>/dev/null || missing+=("BT_API_KEY")
grep -qE '^BT_PROJECT_NAME=.+' .env 2>/dev/null || missing+=("BT_PROJECT_NAME")

if [ ${#missing[@]} -gt 0 ]; then
  echo "✗ 缺少必填部署配置，请先补 .env："
  printf '   - %s\n' "${missing[@]}"
  exit 1
fi
echo "✓ COS / 服务器 / 宝塔 配置齐全"
```
> 参考：`SERVER_USER`/`SERVER_PORT` 缺省时脚本用 `root` / `22`；`SERVER_UPLOAD_CONCURRENCY`、`COS_CONCURRENCY` 可省。

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

## 4. 上传到 COS（交互式「清空远程目录」默认喂 n）
`upload:cos` 内置 `readline` 问「是否清空远程目录 yes/no」。**默认喂 `n\n`**：每次生产 build 是新 hash，远程 `static/<hash>` 为空目录，n/y 都直接走"远程目录为空，无需清空"分支→ 照常上传；只有重复部署同一 hash 时 n 才会取消上传。
```bash
printf 'n\n' | bun run upload:cos
```
**核对退出码 0 且 stdout 不出现「❌ 上传已取消」**——后者是 `n` 在前缀非空时的取消信号（exit 0 但等于没传）。

**清空范围与 n/y 的真实语义**（调试用，默认不动）：
- `upload-cos.ts` 里 `UPLOAD_PREFIX = buildHashPrefix || ''`；配 CDN（`_cdnUrl` 为 http(s)）时 `buildHashPrefix` 恒为 `static/<hash>`，y 只清本次构建目录、非全站；未配 CDN → `UPLOAD_PREFIX` 为空，`clearRemoteDirectory()` 守卫拒空、退出整个上传（不会清空全 bucket）。
- 目标前缀**已有文件**时答 n → `main()` 取消整个上传；**为空**时答 n/y 都走"无需清空"分支照常上传。

## 5. 重启服务器（通过宝塔面板 API）
```bash
bun run restart:server
```
> 调宝塔 `/mod/nodejs/com/set_project_status` 接口对 `BT_PROJECT_NAME` 发起 `restart`。**重启成功**才意味着本次部署完成；非 `{ status: true }` 时贴出宝塔返回的 `msg`，常见原因：本机 IP 未加入宝塔 API 白名单、`BT_API_KEY` 错、`BT_PROJECT_NAME` 与宝塔项目名不一致。
>
> restart:server 默认 `restart`，若需 `start` / `stop` 自行加 `-- start` / `-- stop`（skill 默认不调这两个）。

## 6. 汇报
- 任一步退出码非 0 → 原样贴出报错，**别吞**；并明确指出卡在哪一步（build / server / cos / restart）。
- 全绿 → 一行「✓ 构建 + upload:server + upload:cos + restart:server 完成」，并提醒静态资源走 CDN 回源、Nitro 由 `SERVER_HOST` 承载且已重启到新版本。
- **边界**：本 skill 不碰 DB、不跑 migrate；上传属对外动作，未确认不下刀。
