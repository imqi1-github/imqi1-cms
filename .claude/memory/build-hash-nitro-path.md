# build-hash.json 写入机制与 nitro 路径脆弱性

**.output/build-hash.json 唯一写入者是 postbuild 脚本 `scripts/update-sw-cdn.mjs`。** `nuxt.config.ts` 第 13 行注释「由 `build:done` hook 落盘」是**空头支票——全仓库没有 build:done hook**（vite:extendConfig / nitro.hooks.compiled 都不是）。谁若按注释去找 hook 会空手而归。

## 机制
`update-sw-cdn.mjs` 从 nitro 服务端产物里正则抓 `"buildHash":"<ts>-<hex>"`，据此写 `{ hash, dir: "static/<hash>" }` 到 `.output/build-hash.json`，供 `upload-cos.mjs` 作 COS 前缀（`${dir}/${相对路径}`，dir 无前导斜杠）。若 `nuxt build` 时 `NODE_ENV!=production`，buildHash 为空串，无需此文件。

## 为何会坏（2026-09-01 实战）
脚本曾**硬编码**产物路径 `.output/server/chunks/_/nitro.mjs`，但 Nitro 版本间该文件位置会变：
- 较早：`chunks/_/nitro.mjs`（`chunks/_` 实为服务端 util chunk，往往没有 nitro.mjs）
- nuxt 4.4.8 / Nitro 2.13.4：`chunks/nitro/nitro.mjs`

路径不中 → `readFileSync` 抛 ENOENT → 被脚本 `catch` 吞掉（仅 stderr 一行）→ `buildHashDir` 保持空串 → `.output/build-hash.json` **静默缺失**。触发点：升级/锁定 nuxt.(提交「锁定 4.4.8 回退 4.5」) 改变 nitro 布局。

**连带症状**：`buildHashDir=""` 时脚本把 sw.js 的 precache 改写为 `url:"https://cdn.xxx.com//xxx.js"`（**双斜杠**，因 `${base}/` + `""` 拼接）。且**脚本对已是 `https://` 绝对 URL 的项 `return` 跳过**（防重复改写），故被污染过的 sw.js **不会自愈**——干净重建 `bun run build` 才重新生成相对 URL→改写正确。

## 修复（已应用）
不再硬编码路径：先试已知候选 `chunks/nitro/nitro.mjs`、`chunks/_/nitro.mjs`，找不到再递归扫描 `.output/server/chunks` 下所有 `.mjs` 找 `"buildHash"`。见 `update-sw-cdn.mjs` 的 `findFileWithRegex` + 候选数组 + 兜底。

## 核对一致性
`node -e "...match(/\"buildHash\":\s*\"([^\"]+)\"/)..."` 取 nitro.mjs 的 hash，须等于 `build-hash.json` 的 hash（别用 `grep -oE`——688KB minified 文件被当二进制，`-o` 抓不到；nginx 用 `grep -a` 或 node）。统计字符串用 `grep -oc` 而非 `grep | head && echo`（head 恒 0 致 `&&` 假阳性）。
