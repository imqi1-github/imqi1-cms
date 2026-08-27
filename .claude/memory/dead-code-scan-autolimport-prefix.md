---
name: dead-code-scan-autolimport-prefix
description: 扫死代码时,组件可能被 Nuxt 自动导入的「目录前缀/Lazy前缀」引用,别把活组件误判为死
metadata:
  type: project
---

# 死代码扫描:Nuxt 自动导入前缀盲区

手动扫「未使用的 Vue 组件」时,**不能只看无前缀的 `<组件名>`**。Nuxt 自动导入会给组件加**目录前缀 + Lazy 前缀**:
- `components/admin/TravelCoordinatePicker.vue` → 必须用 **`<AdminTravelCoordinatePicker>`**
- `components/site/ActivityHeatmap.vue` → 必须用 **`<SiteActivityHeatmap>`**
- `components/ContextMenu.vue` → 被 **`<LazyContextMenu>`**(懒加载)用
- 任意 `components/<目录>/X.vue` → `<目录驼峰X>` 或 `<Lazy目录驼峰X>`

**Why**: 2026-08-27 我扫「未引用组件」时只 grep `<ContextMenu>`/`<ActivityHeatmap>`/`<TravelCoordinatePicker>`(无前缀),把 3 个活组件全误判为死;其中 ContextMenu 被误 `rm` 删除,靠 `git checkout` 恢复。用户坚持「复核」才揪出。eslint `no-unused-vars` 也抓不到(组件是自动导入,无 import 语句)。

**How to apply**: 扫组件死代码前,先弄清该组件所在目录是否参与前缀,或直接全局 grep 组件名(不限定标签格式),排除定义文件后仍有引用即视为活。确定性更高的做法用 `knip` 等专业工具。`.d.ts`/schemas 不走自动导入,无此坑;仅 Vue 组件有。
