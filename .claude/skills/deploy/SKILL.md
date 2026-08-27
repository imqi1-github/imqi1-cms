---
name: deploy
description: 构建并上传到云端：bun run build + upload:cos + upload:server。**先校验 .env 里 COS/SERVER 上传配置是否齐全（缺即停）**；upload:cos 有交互式「清空远程目录 yes/no」——Claude 用 `printf 'y\n' |` 喂 stdin 即可代跑。清空范围以 `buildHashPrefix`（.build-hash-dir，配 CDN 时恒为 `static/<hash>`）为准，当前配置下 `y` 只清本次构建目录、非全站；**`n` 在前缀已有文件时会取消整个上传（exit 0）**，须向用户取明确 y/n。每次改动后要发版部署时使用。
---

# /deploy — 构建并上传到云端

目标：把本地最新代码构建成产物，上传到腾讯云 COS（静态资源）与自建服务器（Nitro server）。**这是对外发布动作，每一步都先确认。**

**关键：upload:server 会因缺少 `SERVER_HOST` 等直接 `exit(1)`；upload:cos 有一个交互式「清空远程目录 yes/no」——Claude 可用 `printf 'y\n' |` / `printf 'n\n' |` 向 stdin 喂答案代跑，**不会挂起**。清空范围由 `scripts/upload-cos.mjs` 的 `UPLOAD_PREFIX` 决定（`= buildHashPrefix || COS_PREFIX || ''`）：**配了 CDN（`_cdnUrl` 为 http(s)）时恒为 `static/<hash>`**，`y` 只清本次构建目录（随即重传），**非全站**；`.env` 的 `COS_PREFIX` 只有未配 CDN（`.build-hash-dir` 为空）时才参与。**⚠️ `n` 不是「增量覆盖」**：目标前缀已有文件时答 `n` → `main()` 取消整个上传（exit 0「上传已取消」）。本流程必须先校 env，并对 y/n 做硬确认。**

## 0. 前置确认
- 这一步会**覆盖线上产物**。开始前向用户复述「将执行 build + 上传 COS + 上传服务器」，确认无异议再动手。
- `upload:cos` 的「清空远程目录」会删除 `UPLOAD_PREFIX` 前缀下的远程文件。配 CDN 时前缀=`static/<hash>`（本次构建目录，随即重传）；未配 CDN 且 `COS_PREFIX` 空 → 前缀=全 bucket（真危险）。务必让用户知道 y 的实际范围与 n 会取消上传。

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
> **当前 .env 实测**：`COS_*` 四项 + `SERVER_HOST/SERVER_PASSWORD/SERVER_UPLOAD_DIR` 均已配置；`SERVER_USER` 缺省用 `root`、`SERVER_PORT`=22、`COS_PREFIX`=`''`（空——但配了 CDN，故实际上传/清空前缀=`static/<hash>`，此值不参与）、`COS_CONCURRENCY`=20；`restart:server` 所需的 `BT_PANEL_URL/BT_API_KEY/BT_PROJECT_NAME` 未配、用不了。缺任一项本步即拦下提示。

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
`upload:cos` 内置 `readline` 问「是否清空远程目录 yes/no」。Claude 用管道喂 stdin 即可代跑，**不会挂起**。关键：**清空范围与 n 的语义都和文案直觉相反**，先读 `scripts/upload-cos.mjs` 再向用户取明确 y/n。

**清空范围（`upload-cos.mjs:79` `UPLOAD_PREFIX = buildHashPrefix || COS_PREFIX || ''`）**
- **配 CDN**（`_cdnUrl` http(s)，当前如此）→ `buildHashPrefix` = `.build-hash-dir` = `static/<hash>` → 前缀=`static/<hash>`。`y` 只删该 hash 目录下的文件名（即刚上传那批），随即重传；**非全站**，`.env` 的 `COS_PREFIX` 不生效。
- **未配 CDN** → `generate-build-hash.mjs:48` 跳过、`.build-hash-dir` 写空 → 前缀回退 `COS_PREFIX`；若它也空 → 前缀=**全 bucket**，`y` 才真的清空全站（不可逆）。

**⚠️ `n` 的真实语义（不是「增量覆盖」）**
- 目标前缀**已有文件**时答 `n` → `clearRemoteDirectory()` 返回 `false` → `main()`（`:327`）**取消整个上传**：`❌ 上传已取消`，exit 0。会「看似成功、实际没传」。
- 目标前缀**为空**时（每次生产 build 都是新 hash）→ 答 `n`/`y` 都命中「远程目录为空，无需清空」（`:204`）→ 返回 `true` → 照常上传。常规部署即此场景，`n` 才「显得安全」。

1. **先向用户取明确答案**（AskUserQuestion 给 n/y + 说明真实后果）：常规新 hash 部署选 `n` 或 `y` 都会上传（被空目录路径接管）；但重复部署同一 hash、或未配 CDN 时，`n` 是取消、`y` 才是「清旧传新」。
2. 拿到答案后喂 stdin 代跑：
   ```bash
   printf 'n\n' | bun run upload:cos   # 或 printf 'y\n' | ...
   ```
3. 核对退出码，**更要核对 stdout 是否出现「❌ 上传已取消」**——那是 `n` 在前缀非空时的取消信号，非报错但等于**没传**。退出码非 0 → 原样贴报错；成功 → 提示静态资源走 CDN 回源。

> 若用户坚持自己跑，可贴 `! bun run upload:cos` 让其当面回答；但 Claude 无需再假设「喂不了 stdin」。

## 5. 汇报
- 各步退出码非 0 → 原样贴出报错，别吞。
- 全绿 → 一行「✓ 构建 + upload:server + upload:cos 完成」，并提醒静态资源走 CDN 回源、Nitro 由 `SERVER_HOST` 承载。
- 可选下一步：`bun run restart:server`（重载生产 node 进程；需 `BT_PANEL_URL/BT_API_KEY/BT_PROJECT_NAME`，当前 .env 未配置——需用户补充才可用）。
- **边界**：本 skill 只跑 build + 两个 upload；不碰 DB、不跑 migrate；上传属对外动作，未确认不下刀。
