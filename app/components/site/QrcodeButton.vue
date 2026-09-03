<script setup lang="ts">
/**
 * 联系链接中的「二维码项」按钮。
 *
 * 行为:
 * - 桌面端 hover 弹出二维码图片(保留原 group-hover 行为,组件无需感知断点)。
 * - 移动端 / 键盘:click toggle 展开/收起。
 * - 点击弹层外区域关闭(用 mousedown + contains 判断,避免与 button click 顺序冲突)。
 * - Esc 关闭并把焦点送回按钮。
 *
 * a11y:
 * - button 上有 aria-haspopup / aria-expanded / aria-controls,弹层 role="img" + aria-label。
 * - focus-visible 焦点环沿用 ui/button 同款(ring-ring/50 + ring-[3px])。
 *
 * @example
 * ```vue
 * <SiteQrcodeButton v-if="link.qrcode" :link="link" />
 * ```
 */
import { ref } from "vue";
import { useEventListener } from "@vueuse/core";

import type { SiteConfig } from "~~/lib/site-config";

// social 元素类型直接从 SiteConfig["social"] 索引派生,
// 保持与 lib/site-config.ts 同源,避免在多份地方重复定义形状。
type SocialItem = NonNullable<SiteConfig["social"]>[number];

const props = defineProps<{ link: SocialItem }>();

// 弹层是否展开。组件实例独立持有(open 不外露),多个 QrcodeButton 互不干扰。
const open = ref(false);
const buttonRef = ref<HTMLButtonElement | null>(null);

// popoverId 与 button 节点 id 都用 social.name 做后缀(name 已天然唯一,与 v-for :key 一致)
const popoverId = `qrcode-popover-${props.link.name}`;

const toggleQrcode = () => {
  open.value = !open.value;
};
const closeQrcode = () => {
  open.value = false;
};

// 点外部关闭:mousedown 先于 click 触发。
// - 命中按钮:不关,由 button 的 click 自己 toggle。
// - 命中弹层(pointer-events-none,但仍可能被命中):不关,弹层只展示。
// - 命中外部:把 open 置 false。
const onOutsideMousedown = (e: MouseEvent) => {
  if (!buttonRef.value) return;
  // mousedown 在按钮上 → 让 click 处理 toggle
  if (buttonRef.value.contains(e.target as Node)) return;
  if (open.value) closeQrcode();
};
useEventListener(window, "mousedown", onOutsideMousedown);

// Esc 关闭并把焦点送回按钮(沿用 Dialog/Sheet 弹层关闭惯例)
useEventListener(window, "keydown", e => {
  if (e.key === "Escape" && open.value) {
    closeQrcode();
    buttonRef.value?.focus();
  }
});
</script>

<template>
  <button
    v-if="link.qrcode"
    :id="`qrcode-trigger-${link.name}`"
    ref="buttonRef"
    type="button"
    class="group relative flex items-center justify-center w-9 h-9 rounded-md transition-all duration-200 text-gray-500 dark:text-gray-400 hover:bg-slate-100 dark:hover:bg-gray-800 hover:text-slate-900 dark:hover:text-white focus-visible:ring-ring/50 focus-visible:ring-[3px] outline-none cursor-pointer"
    :class="{ 'bg-slate-100 dark:bg-gray-800 text-slate-900 dark:text-white': open }"
    :aria-label="link.name"
    aria-haspopup="dialog"
    :aria-expanded="open"
    :aria-controls="popoverId"
    @click="toggleQrcode">
    <Icon :name="link.icon" aria-hidden="true" class="size-5" mode="svg" />
    <div
      :id="popoverId"
      role="img"
      :aria-label="`扫码打开${link.name}`"
      class="pointer-events-none absolute top-full left-1/2 -translate-x-1/2 mt-2 z-30 w-max opacity-0 scale-95 translate-y-1 transition-all duration-200 group-hover:opacity-100 group-hover:scale-100 group-hover:translate-y-0"
      :class="{ 'opacity-100! scale-100! translate-y-0!': open }">
      <div class="rounded-lg bg-white dark:bg-[#1e1e1e] p-2 shadow-[0_6px_30px_#0000001a] dark:shadow-[0_6px_30px_#00000080] border border-slate-200 dark:border-gray-700">
        <img
          :src="publicAsset(link.qrcode)"
          :alt="link.name"
          width="144"
          height="144"
          decoding="sync"
          fetchpriority="low"
          class="block w-36 h-36 max-w-none rounded-full object-cover" >
        <p class="mt-1 text-center text-xs text-slate-600 dark:text-gray-400">{{ link.name }}</p>
      </div>
    </div>
  </button>
</template>
