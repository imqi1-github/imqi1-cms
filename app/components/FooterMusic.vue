<script setup lang="ts">
import { onMounted } from "vue";

// 使用全局站点设置
const { siteSettings } = useSiteSettings();
const settings = computed(() => siteSettings.value);

// 地图中心页：毛玻璃浮于地图之上，无阴影；非地图页保持原白卡样式
const route = useRoute();
const isTravelPage = computed(() => route.path === "/map");
const btnShell = computed(() =>
  isTravelPage.value
    ? "border-transparent bg-linear-to-b from-white/60 to-white/85 dark:from-black/60 dark:to-black/85 backdrop-blur-[20px]"
    : "border border-gray-200 dark:border-gray-700 bg-white dark:bg-slate-800",
);

// 解析音乐播放列表 ID
const playlistConfig = computed(() => {
  const config = settings.value?.musicPlaylistId || "9255074836 || netease";
  const [id = "", server = "netease"] = config.split("||").map((s: string) => s.trim());
  return { id, server };
});

// 使用全局音频播放器状态
const { currentSong, isPlaying, isLoaded, progress, initPlayer, togglePlay } = useAudioPlayer();

// 初始化播放器（只执行一次）：延迟到空闲时段，不抢首页加载关键路径。
// 先用 setTimeout 让出英雄区渐入/字体稳定窗口，再交给 requestIdleCallback 等空闲
// 时段拉取歌单并创建 Audio；不支持 rIC 的浏览器回退到固定延时。
onMounted(() => {
  const MIN_DELAY = 1200;
  const start = () => initPlayer(playlistConfig.value);
  if (typeof requestIdleCallback === "function") {
    setTimeout(() => requestIdleCallback(start), MIN_DELAY);
  } else {
    setTimeout(start, MIN_DELAY);
  }
});
</script>

<template>
  <Transition name="fade">
    <button
      v-if="isLoaded && currentSong"
      class="group relative flex items-center gap-2 rounded-full py-0.75 pr-0.75 pl-2 cursor-pointer transition-all duration-300 overflow-hidden max-w-36 h-7.5"
      :class="btnShell"
      @click="togglePlay">
      <!-- 进度条背景（暂停时也保留，仅停在当前进度） -->
      <span
        class="absolute inset-y-0 left-0 bg-linear-to-r from-blue-500 to-purple-500 opacity-15 transition-all duration-300"
        :style="{ width: `${progress}%` }"/>

      <!-- 歌曲名称 -->
      <span class="relative z-1 min-w-0 flex-1">
        <span class="block text-xs font-medium text-gray-900 whitespace-nowrap overflow-hidden text-ellipsis dark:text-gray-100">
          {{ currentSong.name }}
        </span>
      </span>

      <!-- 封面图（播放时旋转） -->
      <img
        :src="currentSong.pic"
        alt=""
        class="spin-slow relative z-1 h-full shrink-0 rounded-full object-cover bg-gray-100 dark:bg-gray-700"
        :style="{ 'animation-play-state': isPlaying ? 'running' : 'paused' }"
        loading="lazy" >

        <span class="absolute inset-0 text-xs text-white bg-blue-600 z-2 flex items-center justify-center opacity-0 group-hover:opacity-100 duration-150 ease-in-out">
          {{ isPlaying ? '暂停播放' : '开始播放' }}
        </span>
    </button>

    <!-- 播放器初始化前占位：歌单拉取/建 Audio 未完成时不显示空白，先给一个加载态。
         initPlayer 延迟到空闲时段（rIC + 1200ms），故首屏停留约 1-2s，占位避免按钮位空缺。 -->
    <div
      v-else
      class="flex items-center gap-2 rounded-full py-0.75 pr-0.75 pl-2 max-w-36 h-7.5"
      :class="btnShell">
      <span class="relative z-1 min-w-0 flex-1">
        <span class="block text-xs text-gray-400 dark:text-gray-500 whitespace-nowrap overflow-hidden text-ellipsis">
          音乐加载中
        </span>
      </span>
      <span class="relative z-1 flex h-full shrink-0 items-center justify-center rounded-full bg-gray-100 dark:bg-gray-700">
        <Icon name="lucide:loader-2" class="size-3.5 animate-spin text-gray-400 dark:text-gray-500" mode="svg" />
      </span>
    </div>
  </Transition>
</template>

<style scoped>
/* 封面旋转动画 */
@keyframes spin {
  from {
    transform: rotate(0deg);
  }
  to {
    transform: rotate(360deg);
  }
}

.spin-slow {
  animation: spin 16s linear infinite paused;
}
</style>
