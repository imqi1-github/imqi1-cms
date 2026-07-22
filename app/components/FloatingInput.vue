<script setup lang="ts">
import type { HTMLAttributes } from "vue";

import { cn } from "@/lib/utils";

defineOptions({ inheritAttrs: false });

const props = defineProps<{
  /** 浮动标签文字（无内容/未聚焦时作为占位文字显示在框内） */
  label: string;
  /** 关联的 input id，label 会通过 for 指向它 */
  id?: string;
  /** input 类型，默认 text */
  type?: string;
  /** 可选右侧装饰图标，传 iconify 图标名（如 lucide:user）；不传则不显示 */
  icon?: string;
  /** 可选左侧装饰图标（如搜索框 ri:search-line）；不传则不显示 */
  leadingIcon?: string;
  /** 尺寸：default(py-3,约 48px,表单主用) | sm(h-7=28px,与评论验证码图/按钮等高) */
  size?: "default" | "sm";
  /** 多行文本：渲染 textarea 代替 input（如评论内容） */
  multiline?: boolean;
  /** 透传到内部 input 的额外 class */
  class?: HTMLAttributes["class"];
}>();

// 双向绑定：默认空串，保证 :placeholder-shown 初始即生效
const model = defineModel<string | number>({ default: "" });

const slots = useSlots();
// 右侧是否有内容：装饰图标(icon) 或可交互插槽(#trailing，如清除按钮/验证码图)
const hasTrailing = computed(() => Boolean(props.icon || slots.trailing));

const inputEl = useTemplateRef<HTMLInputElement | HTMLTextAreaElement>("inputEl");

const inputClass = computed(() =>
  cn(
    // 水平内边距按左/右侧图标有无分写 pl/pr，避免与 px 合写时的覆盖歧义。
    // 尺寸：default 用 py-3(约 48px)上下对称、文字垂直居中；
    //       sm 用 h-7(28px)，与评论验证码图/按钮等高(单行 input 文本浏览器自带垂直居中，故只设高度)。
    "peer w-full rounded bg-white dark:bg-slate-950 border border-gray-200 dark:border-gray-700 outline-none transition-colors text-gray-900 dark:text-gray-100 hover:border-blue-600 focus:border-blue-600 disabled:cursor-not-allowed disabled:opacity-60",
    // 多行(textarea)：min-h 撑高 + 允许垂直拉伸；单行按尺寸分支定高。
    props.multiline
      ? "min-h-[10em] resize-y py-2.5 leading-normal text-[0.95em]"
      : props.size === "sm"
        ? "h-7 text-[0.875em]"
        : "py-3 text-[0.95em]",
    props.leadingIcon ? "pl-10" : "pl-3",
    hasTrailing.value ? "pr-10" : "pr-3",
    props.class,
  ),
);

// 暴露 focus，供父组件（如搜索框 onMounted 自动聚焦）调用
defineExpose({
  focus: () => inputEl.value?.focus(),
  // 底层 input/textarea 元素：供父组件做光标 selection 等原生操作（如评论框插入表情）
  getInputElement: () => inputEl.value,
});
</script>

<template>
  <div
    class="floating-input relative"
    :class="{ 'has-leading': leadingIcon, 'is-multiline': multiline }"
  >
    <!-- 左侧装饰图标（如搜索图标） -->
    <div
      v-if="leadingIcon"
      class="pointer-events-none absolute inset-y-0 left-3 flex items-center text-slate-400 dark:text-slate-500"
    >
      <Icon
        :name="leadingIcon"
        aria-hidden="true"
        class="size-5"
      />
    </div>
    <textarea
      v-if="multiline"
      :id="id"
      ref="inputEl"
      v-model="model"
      placeholder=" "
      v-bind="$attrs"
      :class="inputClass"
    />
    <input
      v-else
      :id="id"
      ref="inputEl"
      v-model="model"
      :type="type || 'text'"
      placeholder=" "
      v-bind="$attrs"
      :class="inputClass"
    >
    <label
      :for="id"
      class="floating-input-label"
    >{{ label }}</label>
    <!--
      右侧：优先 #trailing 插槽(可交互，如清除按钮、验证码图)；否则用 icon 装饰图标。
      均用"满高 + flex items-center"包裹层垂直居中——不依赖 transform/translate
      (会被全局 span.iconify 规则覆盖，导致 -translate-y-1/2 失效)。
    -->
    <div
      v-if="slots.trailing"
      class="absolute inset-y-0 right-3 flex items-center"
    >
      <slot name="trailing" />
    </div>
    <div
      v-else-if="icon"
      class="pointer-events-none absolute inset-y-0 right-3 flex items-center text-slate-400 dark:text-slate-500"
    >
      <Icon
        :name="icon"
        aria-hidden="true"
        class="size-5"
      />
    </div>
  </div>
</template>

<style scoped>
/*
  浮动标签：纯 CSS 驱动（:placeholder-shown + :focus），无 JS 状态，
  SSR 安全、无 hydration mismatch；且对浏览器自动填充也能正确触发上浮。
  input 始终带 placeholder=" "（一个空格），靠 :placeholder-shown 判空。
  颜色全部走 CSS 变量（--fi-*），由下方非 scoped 的 <style> 按 .dark 覆盖，
  避免 scoped + :global + 兄弟/伪类复合选择器在编译期被丢弃。
*/
.floating-input-label {
  position: absolute;
  /* left(8px) + padding-left(4px) = 12px，与 input px-3 文字左对齐，
     上浮前后文字水平位置不变，避免动画过程横向漂移 */
  left: 0.5rem;
  padding-inline: 0.25rem;
  top: 50%;
  transform: translateY(-50%);
  transform-origin: left center;
  font-size: 0.95em;
  line-height: 1.4;
  color: var(--fi-resting-color);
  background-color: transparent;
  pointer-events: none;
  cursor: text;
  /* 上浮/回落间变化的属性必须全部列入 transition：
     line-height(1.4↔1.1 决定标签盒高)与 background-color(transparent↔notch)
     若遗漏，会在状态切换瞬间瞬变，而 font-size 仍在过渡中，二者不同步
     即产生"上浮时尺寸/底色跳一下"的观感。 */
  transition:
    top 0.18s cubic-bezier(0.4, 0, 0.2, 1),
    transform 0.18s cubic-bezier(0.4, 0, 0.2, 1),
    font-size 0.18s cubic-bezier(0.4, 0, 0.2, 1),
    line-height 0.18s cubic-bezier(0.4, 0, 0.2, 1),
    color 0.18s ease,
    background-color 0.18s ease;
}

/*
  有内容或聚焦时：上浮到上边框上(标签垂直中心压在边框线)、缩小文字、高亮主色。
  标签要"挖空"压住的那段边框，使边框在标签处断开——经典浮动标签效果。

  输入框背景已与页面背景一致(亮色均白、暗色均 slate-950)，标签上下两侧同色，
  挖空底只需单一纯色(--fi-notch)即可与两侧完全融合，边框被干净挖断。
*/
.floating-input input:focus ~ .floating-input-label,
.floating-input input:not(:placeholder-shown) ~ .floating-input-label,
.floating-input textarea:focus ~ .floating-input-label,
.floating-input textarea:not(:placeholder-shown) ~ .floating-input-label {
  top: 0;
  transform: translateY(-50%);
  /* 0.75em@16=12px。若低于浏览器最小字号(常见 12px)，transition 按数学值
     插值到 11.2px、结束后才被 clamp 回 12px，产生上浮末尾的尺寸跳变。
     故取正好 12px，使过渡终点与渲染值一致。 */
  font-size: 0.75em;
  line-height: 1.1;
  color: var(--fi-floated-color);
  background-color: var(--fi-notch);
}

/* 多行(textarea)：文字从顶部 padding 开始(非垂直居中)，resting 标签贴顶与首行对齐 */
.floating-input.is-multiline .floating-input-label {
  top: 0.625rem; /* 10px，与 textarea py-2.5 首行文字对齐 */
  transform: none;
}

/* 右侧有内容时，避免上浮/居中标签与右侧图标或插槽相撞：限制标签最大宽度 */
.floating-input:has(input.pr-10) .floating-input-label {
  max-width: calc(100% - 2.5rem);
}

/* 有左侧图标时，标签起点右移到图标之后，与输入文字(pl-10=40px)左对齐 */
.floating-input.has-leading .floating-input-label {
  left: 2.25rem; /* 36px = 文字起点 40px - 标签左内边距 4px */
}
</style>

<!--
  主题变量（非 scoped / 全局）：.dark 走普通祖先选择器，
  不参与 scoped 改写，保证浅色/深色两套取值都能编译并命中。
-->
<style>
.floating-input-label {
  --fi-resting-color: #94a3b8; /* slate-400 */
  --fi-floated-color: #2563eb; /* blue-600 */
  /* 上浮标签挖空底：与输入框/页面背景同色(须与上方 dark:bg-slate-950 保持一致) */
  --fi-notch: #ffffff;
}

.dark .floating-input-label {
  --fi-resting-color: #64748b; /* slate-500 */
  --fi-floated-color: #60a5fa; /* blue-400 */
  /* 取 Tailwind v4 slate-950 的 oklch 原值，与 dark:bg-slate-950 逐像素对齐 */
  --fi-notch: oklch(0.129 0.042 264.695); /* slate-950 */
}
</style>
