---
name: cn-is-pure-clsx-no-tailwind-merge
description: 项目 cn() 是纯 clsx 不带 tailwind-merge，后写的冲突 class 不会覆盖先写的；改 display 等靠 scoped CSS 特异性或直接改传入串
metadata: 
  node_type: memory
  type: project
  originSessionId: 2efe3927-449c-4537-9ee6-4c656a190cf6
---

本项目 `app/lib/utils.ts` 的 `cn(...inputs)` 实现是 `return clsx(inputs)`——**只拼接、不去重、不带 tailwind-merge**。与 shadcn-vue 默认（`twMerge(clsx(...))`）不同。

**后果**：`cn("flex ...", "block")` 输出串里 `flex` 和 `block` **并存**，谁生效取决于 Tailwind 生成 CSS 里的源序（`flex` 通常排在 `block` 后→`flex` 赢），**不是**类名字面顺序。所以"末尾追加一个 class 来覆盖前面的"这套思路在这里不成立。

**Why**: EmojiRichInput 后台透传 shadcn Textarea 的 `flex`，contenteditable 一旦 flex，`<br>` 沦为零尺寸 flex item 不换行→表情后 Enter 光标挂在表情右侧而非换行；本想 `cn(默认, props.class, "block")` 用 block 压 flex，但 clsx 不去重，flex 仍在。

**How to apply**:
- 要强制某个属性（display 等）压过调用方透传的 Tailwind 工具类：用 **scoped CSS**。Vue scoped 把 `.foo` 编译成 `.foo[data-v-x]`，特异性 (0,2,0) 压过单类 Tailwind `.flex` (0,1,0)。EmojiRichInput 的 `.rich-input { display:block }` 就是这么兜底的。
- 或者直接改调用方传入的 class 串（删掉冲突项），不要指望 cn 去重。
- 判断是否中招：`getComputedStyle(el).display` 与类名字面顺序不一致即可确认。
- 别给本仓库引入 tailwind-merge 只为这点（影响面大）；scoped CSS 更外科手术。

另：Vue 对**缺省的 Boolean prop** 解析为 `false`（非 `undefined`）。`defineProps<{ floating?: boolean }>()` 不传 floating 时值为 false；要"缺省即 true"必须 `withDefaults(defineProps<...>(), { floating: true })`。EmojiRichInput 的 floating 标签开关就踩了这个，前台不传 floating 被当 false→错进静态模式。
