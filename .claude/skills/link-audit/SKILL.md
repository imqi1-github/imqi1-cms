---
name: link-audit
description: >-
  用百度内容审核审查友链与订阅源是否存在违法违规内容：采集清单（线上部署地址或本地库）→ 抓取页面与
  订阅文章落盘快照 → 百度机审判定 → 输出违规站点、违规内容出现位置与置信度的报告，
  并可按用户确认禁用友链或删除订阅。防止大陆备案站点被友链/订阅里的违法违规内容连带污染。
---

# /link-audit — 友链与订阅合规审查（百度内容审核）

**目标**：在违规内容被搜索引擎收录、或监管顺着友链/订阅溯源到本站之前，把污染源找出来并下线。

**为什么这两块要审**：
- **订阅**：订阅文章的**标题与摘要直接渲染在本站 `/subscribes` 页面**，违规内容会变成本站自己的页面内容（可被收录、可被截图举证）。
- **友链**：外链跳转本身不呈现内容，但会带来连带认定（给违规站导流）与垃圾外链权重；友链的**名称与描述也渲染在本站 `/links` 页**，同样是我们自己的内容。

**架构**：脚本负责「采集 → 抓取 → 送审 → 出报告」，**判定直接采用百度内容审核的原始结论**，不做模型复核、仓库内也不存任何违规词表。

## 0. 前置

```bash
cd "$(git rev-parse --show-toplevel)"   # 防 CWD 残留在 mini/
```
`WORK` 用系统临时目录（仓库外），**抓到的正文不写进项目目录**。只审部分目标时加 `--only 34,17`。

## 1. 采集清单

```bash
# 模式 A：本地库（最全——含订阅源地址与全部订阅文章正文）
bun .claude/skills/link-audit/scripts/collect.ts --source local --work "$WORK"

# 模式 B：线上部署站点（反映「访客实际看到的内容」；线上不公开订阅源地址，只有站内已缓存的文章）
bun .claude/skills/link-audit/scripts/collect.ts --source online --base https://imqi1.com --work "$WORK"
```
产物 `$WORK/targets.json`：`links[]`（友链 id/name/url/desc）、`subscribes[]`（订阅源 id/name/url）、`posts[]`（订阅文章 title/link/description/content/origin）。

## 2. 抓取快照（审查范围已收窄）

```bash
bun .claude/skills/link-audit/scripts/snapshot.ts --targets "$WORK/targets.json" --work "$WORK" --max-pages 3
```
- **只保留对方「自己的内容」**：站外链接条目（他们的友链/外链聚合）、友链与导航类板块、评论区留言板在抓取时就屏蔽掉，不送审 —— 那些是他们的责任，不记到本站头上（每个目标的屏蔽数量记在 manifest 的 `notes`）。
- 仍会审：友链的 `00-info.txt`（**本站展示的友链名称/描述**）+ 对方首页与最多 3 个站内抽样页（`--max-pages`）；订阅源的 `00-info.txt`（订阅源名称）+ 站内缓存的订阅文章（本站真正渲染的那批，每源最近 12 篇，`--max-posts`）+ feed 实时条目。
- 产物：`$WORK/manifest.json`（目标状态、快照路径、页标题、备注）+ `$WORK/targets/<kind>-<id>/*.txt`（纯文本快照，带 URL/标题/字段头）。

## 3. 百度内容审核（判定环节）

```bash
bun .claude/skills/link-audit/scripts/baidu-audit.ts --work "$WORK" [--concurrency 2] [--qps 3] [--max-items 0]
```
- **凭证来源（优先级）**：进程环境 `BAIDU_API_KEY`/`BAIDU_SECRET_KEY` → skill 目录 `.env.local`（**未纳入版本管理**，模板见 `.env.example`）→ 站内 DB `informations` 表（后台「评论审核」已配的那套）→ 都没有则**跳过机审**。
- 接口与站内 `server/utils/baidu-audit.ts` 同源（自定义文本审核 v2 同步版）。该接口单条长度上限实测只有 **6000~8000 字符**（超限报 `282909 text overlength`），脚本按 UTF-8 字节切块并对超长块自动二分。
- 产物 `$WORK/moderation.json`：每份快照的结论 + **命中词 + 字符区间 + 风险子类** + `logId`（留档凭证），并按目标聚合。

**机审结论就是本 skill 的判定**，映射与误报识别见 `reference/rubric.md`（结论 → 置信度：不合规 0.90 / 疑似 0.65）。要点：**机审标记 ≠ 违规成立**——博客语境误报不少（站点名、友链区板块词、数字串、网络流行语都可能被判风险），处置前必须按「命中词 + 风险子类 + 上下文」过目。

## 4. 出报告

```bash
bun .claude/skills/link-audit/scripts/report.ts --work "$WORK"
```
产物 `$WORK/report.md`：需处置清单（站点 / 结论 / 置信度 / 风险子类 / 命中数 / 建议）+ 逐条详述（命中词 / 字符区间 / 上下文 / logId）+ 未覆盖清单。

在会话里给用户**结论摘要**（几个目标、各自命中的风险子类与位置、建议动作），并给出报告路径。

可选的人工标注 `$WORK/verdicts.json`（存在即生效，可把误报标成「误报／保留观察」，见 rubric）。

## 5. 处置（必须先问用户）

处置手册见 `reference/remediation.md`。要点：
- 友链 → 后台「友链管理」关闭开关（走 admin API 会顺带失效页面缓存）；别直接改库，否则 ISR/Redis 缓存里仍是旧页面。
- 订阅 → 后台删除订阅源。
- 处置前把「要动哪几条、动完什么效果」列给用户确认，**用户点头再执行**。
- 处置完复验：再跑一次 `/api/links`（线上）或查库，确认该目标已下线。

## 说明

- **仓库里没有任何违规词表**：判定全部来自百度内容审核。
- 与 `/review`（扫代码约定）、`/check`（lint+typecheck）分工不同：本 skill 审的是**站外内容**。
- 快照与报告都在仓库外；需要留档时由用户决定拷到哪。
