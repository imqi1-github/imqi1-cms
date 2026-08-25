<script setup lang="ts">
import { onClickOutside, onKeyStroke } from "@vueuse/core";

import { EMOJI_CATEGORIES, getEmojiList, loadedEmojiCategories } from "~/utils/emoji";

// 表情选择器：点笑脸 → 弹出分类面板 → 点表情发 insert 事件，由父组件（EmojiRichInput）插入。
// 抽自 CommentInput，前台评论输入与后台评论编辑共用同一套交互。
const emit = defineEmits<{ (e: "insert", key: string): void }>();

const showEmoji = ref(false);
const activeCategory = ref(EMOJI_CATEGORIES[0]?.dataKey ?? "Heo-Sticker");
const panelRef = ref<HTMLElement>();

// 当前分类的表情列表（~/utils/emoji 内按分类缓存，url 已过 publicAsset）
const currentEmojis = computed(() => getEmojiList(activeCategory.value));

// 面板图片加载状态：当前分类已加载完成的图片数
const emojiLoadedCount = ref(0);
watch(activeCategory, () => {
  emojiLoadedCount.value = 0;
});

// 是否显示 loading：面板打开、本会话未加载过该分类、且尚未全部 load 完
const panelLoading = computed(
  () =>
    showEmoji.value &&
    !loadedEmojiCategories.has(activeCategory.value) &&
    emojiLoadedCount.value < currentEmojis.value.length,
);

// 当前分类全部加载完后记入会话缓存，SPA 切回时跳过 loading（信任浏览器缓存）
watch([emojiLoadedCount, currentEmojis], () => {
  if (currentEmojis.value.length > 0 && emojiLoadedCount.value >= currentEmojis.value.length) {
    loadedEmojiCategories.add(activeCategory.value);
  }
});

function onEmojiImgLoad(e: Event) {
  // 旧分类被卸载的图片延迟 @load/@error：已脱离 DOM，不应计入当前分类的加载计数
  const img = e.target as HTMLImageElement;
  if (!img.isConnected) return;
  emojiLoadedCount.value++;
}

// 点击面板外关闭
onClickOutside(panelRef, () => {
  showEmoji.value = false;
});

// Esc 关闭（仅面板打开时响应）
onKeyStroke("Escape", () => {
  if (showEmoji.value) showEmoji.value = false;
});

// 点击表情：发 insert(key)，父组件负责插入 contenteditable。
// 面板保持打开便于连插多个；插入后由 EmojiRichInput.insertEmoji 重新聚焦编辑器。
function insertEmoji(key: string) {
  emit("insert", key);
}
</script>

<template>
  <div ref="panelRef" class="relative">
    <button
      v-tooltip="'表情'"
      type="button"
      class="flex h-7 cursor-pointer items-center justify-center rounded-md border-0 bg-slate-100 px-3 text-[0.875em] font-semibold text-slate-700 transition-colors hover:bg-slate-200 dark:bg-slate-800 dark:text-slate-300 dark:hover:bg-slate-700"
      @click="showEmoji = !showEmoji">
      <Icon name="ri:emoji-sticker-line" class="size-4" />
    </button>
    <!-- 表情面板 - 悬浮 -->
    <Transition
      enter-active-class="transition-all duration-150"
      leave-active-class="transition-all duration-150"
      enter-from-class="opacity-0 -translate-y-2"
      leave-to-class="opacity-0 -translate-y-2">
      <div
        v-if="showEmoji"
        class="absolute right-0 bottom-[calc(100%+8px)] z-100 w-80 rounded-lg border border-slate-200 bg-white p-2 shadow-lg dark:border-slate-700 dark:bg-slate-900">
        <!-- 分类标签 -->
        <div class="mb-2 flex gap-1">
          <button
            v-for="cat in EMOJI_CATEGORIES"
            :key="cat.dataKey"
            type="button"
            class="cursor-pointer rounded border-0 px-2.5 py-1 text-[0.75em] text-slate-500 transition-all duration-150 dark:text-slate-400"
            :class="{ 'bg-blue-500 text-white dark:text-white': activeCategory === cat.dataKey }"
            @click="activeCategory = cat.dataKey">
            {{ cat.label }}
          </button>
        </div>
        <!-- 表情列表 -->
        <div
          class="relative flex max-h-45 flex-wrap gap-1 overflow-y-auto [&::-webkit-scrollbar-thumb]:rounded-sm [&::-webkit-scrollbar-thumb]:bg-slate-300 dark:[&::-webkit-scrollbar-thumb]:bg-slate-600 [&::-webkit-scrollbar]:w-1">
          <button
            v-for="emoji in currentEmojis"
            :key="emoji.key"
            v-tooltip="emoji.name"
            type="button"
            :aria-label="emoji.name"
            class="flex size-8 cursor-pointer items-center justify-center rounded p-0.5 transition-colors duration-150 hover:bg-slate-100 dark:hover:bg-slate-800"
            @click="insertEmoji(emoji.key)">
            <img
              :src="emoji.url"
              alt=""
              class="size-full rounded bg-slate-100 object-contain dark:bg-slate-800"
              @load="onEmojiImgLoad"
              @error="onEmojiImgLoad" >
          </button>
          <!-- 加载指示：仅在该分类图片尚未全部加载完时显示 -->
          <div
            v-if="panelLoading"
            class="pointer-events-none absolute inset-0 flex items-center justify-center rounded bg-white/60 dark:bg-slate-900/60">
            <span class="size-5 animate-spin rounded-full border-2 border-slate-300 border-t-blue-500 dark:border-slate-600 dark:border-t-blue-400" />
          </div>
        </div>
      </div>
    </Transition>
  </div>
</template>
