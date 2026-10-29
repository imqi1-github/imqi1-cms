---
name: link-audit-skill
description: "/link-audit skill：友链+订阅合规审查（抓快照→百度机审判定→出违规站点/位置/置信度报告）；用户强原则=仓库内不放违规词表、不做 agent 复核、只判对方自己的内容"
metadata:
  node_type: memory
  type: reference
---

本项目有 `/link-audit` skill（`.claude/skills/link-audit/`）：审查友链与订阅源是否有违法违规内容，防止大陆备案站点被连带污染。链路 = `collect.ts`（采集）→ `snapshot.ts`（抓取落盘文本快照）→ **`baidu-audit.ts`（百度内容审核判定）** → `report.ts`（渲染报告）→ 可选处置（禁用友链/删除订阅）。

**用户强原则（2026-10-29 明确）**：**仓库里不放任何违规关键词/词表**——「污染视线」；且**不做模型/agent 复核**，判定只走百度内容审核。故脚本只做搬运与机审映射，仓库内无任何词表。

**结论映射（确定性，无模型打分）**：百度 `conclusionType` 2=不合规→置信度 0.90、3=疑似→0.65、1=合规→不进清单、0/缺失=未覆盖。位置 = 命中词 + 字符区间（用 keyword 在快照正文里**实搜**定位，百度 `positions` 字段语义不稳）+ 风险子类 + `logId`（留档凭证）。可选 `$WORK/verdicts.json` 可人工标注覆盖判定（标误报则移出清单）。


**踩过的坑**：
- 线上 `/api/*` 走 `referer-check` 中间件，缺 `Referer` 或域名不在白名单 → **403**（不是 404/500）。`collect.ts` 必须带 `Referer: <base>/`。
- `/api/mini/*` 生产环境要 HMAC 签名（`MINI_API_SECRET` 未配则 fail-closed 401）→ **线上模式拿不到订阅源地址**（`/api/subscribes` 只给文章不给源 URL），完整审计必须 `--source local`。
- `links` / `subscribes` / `subscribeposts` 的列名是 **camelCase**（`"isModification"`、`"modificationStatus"`、`"subscribeId"`、`"pubDate"`），不是 snake_case；`desc` 是 PG 保留字，要写 `"desc"`。
- 本站 `/subscribes` 只渲染**每源最新 10 篇、全站最新 30 篇**（`server/utils/rss.ts` `getSubscribePosts` 末尾 `slice(0, 30)`）→ 快照按 pubDate 倒序取每源最近 N 篇即覆盖展示窗口。
- **订阅的标题与摘要直接渲染在 `app/pages/subscribes.vue`** → 订阅违规内容是「直接呈现」风险（会被收录、可被举证），比友链外链更直接，这是审订阅的重点理由。
- 处置要走 **admin API**（`PATCH /api/admin/links/:id/toggle`、`DELETE /api/admin/subscribes/:id`）才会失效 ISR 缓存（`LINKS_CACHE_ROUTES`=/links,/map；`SUBSCRIBE_CACHE_ROUTES`=/,/subscribes,/map）；直接改库则缓存里仍是旧页面。删订阅**不可逆**（级联删 `subscribeposts`）。
- 快照与报告落在**系统临时目录**（仓库外），抓到的正文不写进项目目录。
- 快照里除对方页面外，还额外落 `00-info.txt`——**本站自己展示**的友链名称/描述、订阅源名称（直接渲染在 `/links`、`/subscribes` 上，风险最直接），一并送审。

**百度内容审核（已接进 skill，机审做定位器、模型做定性）**：
- 站内**早已启用**百度审核（评论审核在用）：`informations` 表存 `baiduApiKey`/`baiduSecretKey`，开关 `moderationApiType="2"`；skill 的 `baidu-audit.ts` 凭证优先级 = 进程环境 → skill `.env.local` → DB `informations`（都取不到则跳过机审）。
- 接口 = **自定义文本审核 v2 同步版** `text_censor/v2/user_defined`（与 `server/utils/baidu-audit.ts` 同源）；**v1 通用版 `text_censor/v1/audit` 实测报 `Unsupported openapi method`，不通**。
- **单条长度上限实测只有 6000~8000 字符**（超限 `282909 text overlength`），官方文档标称 20000 不准 → 按 UTF-8 **字节**切块（12000B）+ 超长自动二分。
- 响应结构：`data[].hits[].wordHitPositions[]` 带 `keyword`/`labelDesc`/`subLabelDesc`/`positions`(字符区间)/`details[]`，`data[].msg` 是风险描述，顶层 `conclusionType`(1合规 2不合规 3疑似)/`log_id`；`positions` 语义不稳，**用 keyword 在块文本里实搜定位更准**。
- **全量实测（2026-10-29，40 目标/392 快照）：34 个目标被机审标记，逐条看上下文后几乎无一可直接下线**——误报形态：站点名+域名→「网址不合规」、友链板块词→「兼职代理」、纯数字串→「涉政/领导人」、AI 创作与日常动作类表述→「涉黄」、口语感叹词→「辱骂」、拼接词→「歧视」。故报告「建议」列按命中子类分级（高危子类标**优先**复核），**机审结论不构成下线建议**，真信号是「上下文为违规内容本体」。
- **博客语境误报极高**（实测正常技术博客被判「不合规」）：站点名+域名→「网址不合规」、"友情链接"→「兼职代理/联系方式-网址」、数字串→「领导人-正向」、"主打一个/内卷"→「网络黑话烂梗」、"命运"→「封建迷信」、网盘链接→「禁止投放广告」→ **机审只能当定位器，不能当判决**，定性必须模型复核。
- skill 的密钥文件用 `.env.local`（已被 `.gitignore` 的 `.env.*` 覆盖），模板命名 `.env.example`（被 `!.env.example` 放行）——不用改 .gitignore。⚠️ **`.env.example` 会被 git 跟踪，真实密钥只能放 `.env.local`**（模板里只留空值）。

**审查范围（用户 2026-10-29 明确）**：**只判各友链/订阅源「自己的内容」**——对方页面里的友链区、外链聚合、留言板属于他们的责任，不记到本站头上。`lib.ts` 的 `maskThirdParty()` 在抓取阶段屏蔽：站外链接条目（锚文本 + 紧跟的「｜描述」文案）、友链/导航/朋友圈类板块（标题到下一个同级标题）、评论区/留言板；每个目标屏蔽数量记在 manifest `notes`。仍审：我们自己展示的友链名称/描述与订阅源名称（`00-info.txt`）+ 对方自己的首页/文章/订阅文章。实测张洪Heo 一个站就屏蔽掉 814 处站外链接条目、4 个友链板块、80 个留言区——**不收窄范围的话，几乎每个站都会因「他们友链区里的灰产站」被误判**。
