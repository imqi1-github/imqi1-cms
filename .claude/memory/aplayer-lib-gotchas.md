---
name: aplayer-lib-gotchas
description: app/lib/aplayer 是 APlayer TS 重构版(.art→.ts)的踩坑——模板转义丢失致 XSS、异步歌词 XHR 竞态致死 Loading、拖拽中断卡 disableTimeupdate
metadata:
  type: project
---

`app/lib/aplayer/`（被重构过的 APlayer，由 `MetingPlayer.vue` 动态 import，客户端专用）有三个非显而易见、lint/typecheck 抓不到的坑，2026-08-25 audit 后修复：

1. **模板 `.art`→`.ts` 丢失 HTML 转义 → DOM XSS**：原 `{{ }}` art-template 默认转义，改手写模板字符串后 `cover`/`options.theme`/`item.name`/`item.artist`/歌词行直接插值，值来自 `/api/meting` 外部不可信 → 含 `"` 可逃逸 `src="` 注 `onerror=`。修复=`app/lib/aplayer/utils.ts` 加 `escapeHtml` 助手，模板对**文本/属性**插值转义；`icons.*`（内联 SVG，原 `{{@ }}` raw）**不转义**。改模板务必记着。
2. **异步歌词 XHR 竞态：切走再回来永久 "Loading"**：旧 `lrc.switch()` 先写 `parsed[index]='Loading'` 占位，XHR 完成只 `index===list.index` 才写真值 → 切走时真值丢弃且占位 truthy 堵死缓存，切回永不重拉。修复=占位**不入缓存**、真实结果**始终写 parsed**、仅当前曲才刷 DOM，加 `loading[]` 防重复请求 + `destroy()` 中止 `pendingXhr`（`player.destroy()` 已调用）。
3. **拖拽被打断卡死**：进度/音量条 `dragStart` 只把 document 监听与 `disableTimeupdate=false` 放 `thumbUp`(mouseup/touchend)；鼠标拖出窗口释放(Firefox 无 mouseup)/`touchcancel` → 监听驻留 + `disableTimeupdate` 恒 true → 进度/时间/歌词停刷。修复=`pointercancel`+`window blur` 兜底 cancel 清理；移动端给 `.aplayer-bar-wrap`/`.aplayer-volume-bar-wrap` 加 `touch-action:none`。

**相关**：`eventClientX/Y` 勿用 `||`（clientX 合法值 0 会误判进 `changedTouches`）；`bar.set` 需 `Number.isFinite` 钳防 `NaN%`；`Storage.volume` 用 `??` 勿 `||`（0 被当 falsy）；`instances.splice(indexOf(this),1)` 需判 `!= -1`；`add()` 空批早退防 `listCurs[-1]!`。约定4（类型独立 `~/types/aplayer`）已覆盖各模板/构造参数。参见 [[admin-write-catch-swallow-pattern]] [[nuxt-ssr-api-bundle-singleton-memory-session]]。
