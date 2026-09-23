---
name: shared-constants-single-source
description: 重复常量一律收进 shared/constants.ts（app 与 nitro 共用），别再就地手写；含分页/站点设置默认值/长度大小上限/接口路径与请求头/缓存头/缓存失效路由集合
metadata:
  node_type: memory
  type: project
---

**同一个值要在 ≥2 处出现，就该进 `shared/constants.ts`**（2026-09-23 建立）。`#shared` 是 Nuxt 内置别名，app 包与 nitro 包都能 `import { X } from "#shared/constants"`（**不自动导入**，需显式 import；app 侧不再有 `app/utils/admin-page-size.ts` 那类"某功能专属常量模块"）。选它而不是 `server/utils/*` 的原因：前后端各写一份的常量（pageSize 上下限、站点设置默认值、上传大小上限、评论长度上限）必须同一个数，放 `shared/` 才有唯一事实源。

收进去的分组：分页（`PAGE_MAX`/`ADMIN_PAGE_SIZE_*`/`CONTENT_PAGE_SIZE_*`/`COMMENT_LOAD_ALL_PAGE_SIZE`/`PUBLIC_LIMIT_MAX`）、站点设置默认值（`DEFAULT_COMMENT_*`/`DEFAULT_CONTENT_PAGE_SIZE`…）、长度与大小上限（`MAX_ATTACHMENT_BYTES`/`MAX_LIVE_PHOTO_BYTES`/`MAX_COMMENT_LENGTH`/`CHANGELOG_MAX_BYTES`/`SEARCH_RESULT_TAKE`…）、接口路径与请求头（`CSRF_TOKEN_ENDPOINT`/`CSRF_HEADER`）、缓存头（`PUBLIC_CACHE_CONTROL` 带 s-maxage / `PUBLIC_CACHE_CONTROL_SHORT` 不带）、错误码（`PRISMA_NOT_FOUND_CODE`）、**ISR 缓存失效路由集合**（`LINKS_/SUBSCRIBE_/CHANGELOG_/COMMENT_/CONTENT_/CATEGORY_/TAG_/TRAVEL_/CONTENT_DETAIL_CACHE_ROUTES`）。

配套的两处基建（不是常量，但和它们绑定）：
- **`clampAdminPageSize(value, fallback)` 在 `shared/constants.ts`** —— 前端自定义档与服务端 4 个后台接口共用同一套钳制，替掉了各写一遍的 `Math.min(MAX, Math.max(MIN, Math.floor(...)))`。
- **`isPrismaNotFoundError(error)` 在 `server/utils/prisma.ts`** —— 原先 31 个接口各抄一遍 `error instanceof Error && "code" in error && error.code === "P2025"`，且写法互有出入（4 种变体）。新增写接口要映射 404 时直接调它。
- 前端格式化：`app/utils/formatDate.ts`（`formatAbsoluteDate` / `formatRelativeTime` / `formatHydratedDate` / `formatDate`）与 `app/utils/formatFileSize.ts`，原先各有 5–6 份就地实现。**注意 `formatDate` 是相对时间**：后台若想要绝对日期别用这个名字（自动导入会静默给你相对时间），用 `formatLocalDate` 语义的名字或显式写 `formatAbsoluteDate`。

踩坑：`sed`/脚本批量插 import 时，**多行 import（`import type {` 换行到 `} from "..."`）的第一行会被当成整条语句**，插进去就是语法错误——插完必须跑 `bunx eslint . --fix` 再 `bunx nuxi typecheck`（改用型问题只有 typecheck 会报，如漏 import）。见 [每次改完跑 lint 三件套](post-change-lint-chain.md)。
