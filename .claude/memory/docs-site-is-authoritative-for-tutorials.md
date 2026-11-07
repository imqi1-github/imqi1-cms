---
name: docs-site-is-authoritative-for-tutorials
description: 教程正文一律放文档站 docs.qi1.website（X:/imqi1-docs 的 content/**/*.mdx），README 只做速览与链接，不再写长篇部署/配置说明
metadata:
  type: feedback
---

用户 2026-11-07 明确：**「以后我的所有教程全放在文档站内」**。据此把根 `README.md` 从 912 行压到 ~50 行，只保留：项目定位一句话、能力 bullet、6 步本地快速开始、参与贡献、License。

**Why:** 教程散在两处会漂移（旧 README 的 lint 命令、端口、脚本清单已与源码不符）。文档站是唯一权威副本，README 只当 GitHub 落地页。

**How to apply:**

- 写教程 → 文档站仓库 `X:/imqi1-docs`，正文放 `content/**/*.mdx`；**路由 = 文件路径**（`content/basics/config.mdx` → `/basics/config`），加页后对照 `src/generated/content-manifest.json` 的 `route` 列表核对链接，别凭印象写路径。
- 根 README 只留链接，不复述步骤。
- 已迁走的旧章节：开发/生产环境搭建、Docker 部署、EdgeOne CDN 接入、`site.config.ts` 全表、package.json 全表、小程序详解、更新日志导入格式、实况照片压缩、IP 查询、故障排查表、宝塔装 PostgreSQL。
- ⚠️ `docker/README.md` 仍在仓库里且内容偏长，与文档站 `/deployment/docker` 重复 —— 下次整理时二选一（本次未动）。
- ⚠️ 本条记忆写完后被并发写入覆盖过一次（仓库 `.claude/memory/` 少了新文件、索引行也被抹掉，用户级镜像那侧还在）——**写完务必 `ls` + `git status` 核实在**，被覆盖就重写。
