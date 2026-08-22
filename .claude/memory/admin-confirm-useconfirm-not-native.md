---
name: admin-confirm-useconfirm-not-native
description: admin 后台确认弹窗统一走 useConfirm() 组合式 + 全局 ConfirmDialog 宿主，禁用原生 confirm()/alert()
metadata: 
  node_type: memory
  type: feedback
  originSessionId: eae2bc19-600b-423e-a63f-cc9f6a54b208
---

后台所有"删除/清空/取消关联/批准拒绝"等二次确认，统一用 `useConfirm()` 组合式函数（`app/composables/useConfirm.ts`），不再用原生 `confirm()`/`alert()`。

**Why:** 用户要求确认弹窗全部改成 shadcn 风格、与 `admin/cache.vue` 的"一键清空全部缓存"弹窗一致（redix-vue Dialog）；原生 confirm() 阻塞线程、样式割裂、移动端体验差。2026-08-03 已把 13 个 admin 页面共 17 处原生 confirm() 全部迁移。

**How to apply:**
- 调用：`const { confirm } = useConfirm()`（Nuxt 自动导入），然后 `if (!await confirm({ title, description, variant: "destructive", confirmText, icon: "lucide:trash-2" })) return`。返回 `Promise<boolean>`，可直接 `await`，是原生 confirm() 的近 drop-in 替换（保留 `const confirmed = await confirm({...}); if (confirmed) {...}` 结构可最小化 diff）。
- 宿主 `<ConfirmDialog />` 已挂在 `AdminLayout.vue` 末尾（全局单例，`useState('confirm-dialog')`），勿在子页面重复挂载。
- 删除/清空用 `variant:"destructive"` + `lucide:trash-2`；批准用 `variant:"default"` + `lucide:check`；取消关联附件用 `lucide:unlink`。
- 新增 admin 写操作别再用 `confirm("...")`。类型见 `app/types/composables/confirm.d.ts`。
- 关联：[[public-api-explicit-field-whitelist]] [[admin-write-api-csrf-required]] 同属 admin 后台范式。
