---
name: admin-editor-autosave-csrf
description: 后台富文本/Markdown 编辑器自动保存 + Ctrl+S + 会话/CSRF 过期防丢；CSRF token 1h 过期是长编辑保存 403 主因
metadata:
  type: project
---

后台文章/页面编辑器（`admin/contents/edit.vue`、`admin/pages/edit.vue`）统一接入 **`app/composables/useEditorAutosave.ts`**，提供：
- Ctrl/Cmd+S 保存；停笔 2s 自动保存（`getIdleMs`），连续打字兜底 60s（`maxIntervalMs`）；自动保存静默、非 toast，状态经 `saveStatus` 显示在右侧保存按钮下的内联指示。
- **自动保存仅限已有内容（有 cid）**；新建（无 cid）只在手动保存时 POST，创建后纳入自动保存。
- `saveContent`/`savePage` 已改为 `(source: "manual"|"autosave") => Promise<SaveResult>`：`source` 控制是否 toast（manual 弹、autosave 静默）；401/403 返回 `{status:"expired"}` 交给组合。

**为什么长编辑必 403（核心坑）**：CSRF token 存 `csrf_token` cookie，`setCsrfToken` 的 `maxAge = 60*60`（**1 小时**，见 `server/utils/csrf.ts`），而 `/api/csrf/token` 只在 token 缺失时新建、不旋转已有 token。编辑 >1h 后内存里的 `csrfToken` ref 过期，保存即 403「CSRF token 验证失败」。**根治 = 每次保存前调 `/api/csrf/token` 并覆盖 ref**（该接口在 cookie 过期后会下发新 token），`useEditorAutosave.refreshCsrf()` 已做。会话 7 天/被单端顶掉 → `getUser` 401。

**过期防丢**：401/403 → `serialize()` 备份到 `localStorage[recoveryKey]`（`imqi1-draft:content:<cid>` / `page:<cid>`），提示重新登录（`navigateTo({path:"/login",query:{to:route.fullPath}})`）；回编辑页 `checkRecovery()` 检测到更新的本地草稿询问恢复。备份键用**函数**（随 cid 变化），勿用固定字符串（新建后 cid 从 null→新 id）。

类型在 `app/types/composables/editor-autosave.ts`（独立文件）。

**加载态复用坑（闪烁/光标丢失根因）**：编辑页骨架屏是 `v-if="loading && isEdit"`，而 saveContent/savePage 原本保存时置 `loading.value=true` → 骨架屏成立 → MarkdownEditor 卸载 → 保存完再挂 → **闪烁+光标丢失**。手动保存偶发、自动保存每 2s 一次即高频闪烁。已拆：新增 `saving` ref（保存进行中，驱动按钮 disabled/文案），`loading` 只反映首次加载（骨架屏）。新增/复用此类"保存中的全局 loading"勿与骨架屏 loading 共用。自动保存有 `busy`/`saving` 守卫防并发。
