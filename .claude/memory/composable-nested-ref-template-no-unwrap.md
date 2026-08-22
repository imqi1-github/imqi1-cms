---
name: composable-nested-ref-template-no-unwrap
description: composable 返回对象里的 ref/computed 在模板里不会自动解包；要模板用其值必须解构成顶层 ref
metadata: 
  node_type: memory
  type: reference
  originSessionId: 2efe3927-449c-4537-9ee6-4c656a190cf6
---

Vue 模板只对 setup 顶层的 ref/computed 自动解包，**嵌套在普通对象里的 ref 不解包**。

**⚠️ 示例已过期（2026-08-23）**：早先以 `useTextareaHistory` 为例——返回 `{ canUndo: ComputedRef, undo, ... }`，模板里 `:disabled="!hist.canUndo"` 拿到的是 **ref 对象本身**（恒 truthy），`!hist.canUndo` 恒为 `false`，disabled 态永远不生效。**该 composable 已重构删除**：undo/redo 现内联在 MarkdownEditor.vue 顶层 `const canUndo = ref(false)`（传给 EditorToolbar 的 `:can-undo` 已是被解包的布尔），坑随之消失。

**但这条 Vue 规则本身仍成立**：嵌套在返回对象里的 ref/computed，模板不会自动解包。当前相关例——EmojiRichInput 消费一段返回对象需 `.value`（`handle.canUndo.value`）；若哪天有 composable 再返回 `{ x: ref }` 且在模板用 `obj.x`，就会踩回同坑。

**修法（通用）**：解构让 ref 成为顶层——`const { canUndo, canRedo, undo, redo } = useX(...)`，模板再 `:disabled="!canUndo"`。解构 ref 不丢响应式（丢响应式的是解构 reactive 对象的属性，不是 ref）。函数（undo/redo/checkpoint）一并解构无妨。

判断信号：模板绑定一个 composable 返回的 ref 总是显示"有值/true"、disabled/条件永不翻转 → 多半是嵌套 ref 没解包。相关：[[cn-is-pure-clsx-no-tailwind-merge]]、[[async-composable-loses-nuxt-instance]] 也是 composable 消费期的坑。
