<script setup lang="ts">
import type { HTMLAttributes } from "vue";

import { cn } from "@/lib/utils";

// 评论内容富文本输入：contenteditable 渲染 :[key] 占位符为内联 <img>，
// 退格删整张图、绝不露占位符。引擎见 composables/useEmojiRichInput。
// 前台/后台共用：floating（默认 true）自带浮动标签，恢复原 FloatingInput 的上浮观感；
// 后台传 :floating="false" 走静态占位符，配合外部 shadcn <Label>（admin 表单全是静态标签，保持一致）。
const props = withDefaults(
  defineProps<{
    modelValue: string;
    id?: string;
    placeholder?: string;
    /** true=自带浮动标签（前台）；false=静态占位符（后台，已有外部 Label） */
    floating?: boolean;
    class?: HTMLAttributes["class"];
  }>(),
  // 必须显式默认 true：Vue 对缺省的 Boolean prop 解析为 false（非 undefined），
  // 不给默认值的话前台不传 floating 会被当作 false → 错误进入静态模式。
  { floating: true },
);

const model = defineModel<string>({ default: "" });

const editorRef = useTemplateRef<HTMLElement>("editorRef");

// 引擎由 useTemplateRef 持有元素引用；isEmpty 走模型派生（onInput 即时同步）
const handle = useEmojiRichInput({ model, editorRef });
const isEmpty = computed(() => model.value.length === 0);

defineExpose({
  insertEmoji: handle.insertEmoji,
  focus: handle.focus,
  getEditorElement: () => editorRef.value,
});

// 默认样式：抄 FloatingInput 多行分支（前台内容字段与其余 FloatingInput 视觉一致）。
// 末尾合入 props.class，后台可传 shadcn Textarea class 覆盖视觉（min-h/bg 等）。
// 注意：本项目 cn 是纯 clsx（无 tailwind-merge），props.class 里的冲突项不会被去重——
// 所以后台透传的 `flex` 会与默认并存。contenteditable 必须 block（flex 下 <br> 不换行，
// 致表情后 Enter 光标挂在表情右侧），靠下面 scoped `.rich-input { display:block }` 兜底：
// scoped 选择器 `.rich-input[data-v-x]` 特异性 (0,2,0) 压过 Tailwind `.flex` 的 (0,1,0)。
const inputClass = computed(() =>
  cn(
    "w-full rounded bg-white dark:bg-slate-950 border border-gray-200 dark:border-gray-700 outline-none transition-colors text-gray-900 dark:text-gray-100 hover:border-blue-600 focus:border-blue-600 disabled:cursor-not-allowed disabled:opacity-60 min-h-[10em] resize-y py-2.5 leading-normal text-[0.95em] px-3",
    props.class,
  ),
);
</script>

<template>
  <div
    class="rich-input-wrap"
    :class="{ 'is-empty': isEmpty, 'is-static': floating === false }"
  >
    <div
      :id="id"
      ref="editorRef"
      class="rich-input"
      :class="inputClass"
      contenteditable="true"
      role="textbox"
      aria-multiline="true"
      :aria-label="placeholder"
      :data-placeholder="placeholder"
      @input="handle.onInput"
      @paste="handle.onPaste"
      @keydown="handle.onKeyDown"
      @copy="handle.onCopy"
      @drop="handle.onDrop"
      @dragover="handle.onDragOver"
    />
    <label v-if="placeholder && floating !== false" :for="id" class="floating-input-label">{{ placeholder }}</label>
  </div>
</template>

<style scoped>
.rich-input {
  /* 强制 block：scoped 选择器特异性 (0,2,0) 压过调用方透传的 Tailwind `.flex` (0,1,0)。
     contenteditable 一旦变 flex 容器，<br> 就沦为零尺寸 flex item 不再换行，
     表情后按 Enter 光标会挂在表情右侧而非换到新行。 */
  display: block;
  white-space: pre-wrap;
  overflow-wrap: anywhere;
  outline: none;
  cursor: text;
}
/* v-html/innerHTML 注入的 img 不带 scope hash，需 :deep 命中；尺寸跟随字号 1.6em */
:deep(.inline-emoji) {
  display: inline-block;
  vertical-align: middle;
  object-fit: contain;
  margin: 0 2px;
  width: 1.6em;
  height: 1.6em;
}

/* 静态模式（floating=false，后台已有外部 Label）：空框显示淡色占位符文字 */
.rich-input-wrap.is-static .rich-input.is-empty::before {
  content: attr(data-placeholder);
  color: var(--fi-resting-color, #94a3b8);
  pointer-events: none;
}

/*
  浮动标签（默认，前台）：contenteditable 无 :placeholder-shown，改用 wrap 的 :focus-within 与 :not(.is-empty) 驱动。
  复用 FloatingInput 全局 .floating-input-label 上的 --fi-* 主题变量（resting/floated/notch）。
  多行输入：resting 标签贴顶（与 py-2.5 首行对齐）；聚焦或有内容时上浮到上边框、缩小、挖空边框。
*/
.rich-input-wrap {
  position: relative;
}
.rich-input-wrap .floating-input-label {
  position: absolute;
  /* left(8px)+padding(4px)=12px，与 px-3 文字左对齐，上浮前后不横向漂移 */
  left: 0.5rem;
  padding-inline: 0.25rem;
  top: 0.625rem; /* 10px，多行首行文字位置 */
  transform: none;
  transform-origin: left center;
  font-size: 0.95em;
  line-height: 1.4;
  color: var(--fi-resting-color);
  background-color: transparent;
  pointer-events: none;
  cursor: text;
  transition:
    top 0.18s cubic-bezier(0.4, 0, 0.2, 1),
    transform 0.18s cubic-bezier(0.4, 0, 0.2, 1),
    font-size 0.18s cubic-bezier(0.4, 0, 0.2, 1),
    line-height 0.18s cubic-bezier(0.4, 0, 0.2, 1),
    color 0.18s ease,
    background-color 0.18s ease;
}
/* 聚焦或有内容：上浮压在上边框、缩小字号、主色、挖空底断开边框（经典浮动标签） */
.rich-input-wrap:focus-within .floating-input-label,
.rich-input-wrap:not(.is-empty) .floating-input-label {
  top: 0;
  transform: translateY(-50%);
  font-size: 0.75em; /* 12px@16，避开浏览器最小字号的过渡跳变 */
  line-height: 1.1;
  color: var(--fi-floated-color);
  background-color: var(--fi-notch);
}
</style>
