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
  const [id, server = "netease"] = config.split("||").map((s: string) => s.trim());
  return { id, server };
});

// 使用全局音频播放器状态
const { currentSong, isPlaying, isLoaded, progress, initPlayer, togglePlay } = useAudioPlayer();

// 初始化播放器（只执行一次）
onMounted(() => {
  initPlayer(playlistConfig.value);
});
</script>

<template>
  <Transition v-if="isLoaded && currentSong" name="fade">
    <button
      @click="togglePlay"
      class="group relative flex items-center gap-2 rounded-full py-0.75 pr-0.75 pl-2 cursor-pointer transition-all duration-300 overflow-hidden max-w-36 h-7.5 group"
      :class="btnShell">
      <!-- 进度条背景 -->
      <span
        class="absolute left-0 right-0 top-0 bottom-0 bg-linear-to-r from-blue-500 to-purple-500 transition-all duration-300"
        :class="isPlaying ? 'opacity-15' : 'opacity-0'"
        :style="{ width: `${progress}%` }"></span>

      <!-- 歌曲名称 -->
      <span class="relative z-1 min-w-0 flex-1">
        <span class="block text-xs font-medium text-gray-900 whitespace-nowrap overflow-hidden text-ellipsis dark:text-gray-100">
          {{ currentSong.name }}
        </span>
      </span>

      <!-- 封面图（播放时旋转） -->
      <img
        :src="currentSong.pic"
        :alt="currentSong.name"
        class="spin-slow relative z-1 h-full shrink-0 rounded-full object-cover bg-gray-100 dark:bg-gray-700"
        :style="{ 'animation-play-state': isPlaying ? 'running' : 'paused' }"
        loading="lazy" />

        <span class="absolute inset-0 text-xs text-white bg-blue-600 z-2 flex items-center justify-center opacity-0 group-hover:opacity-100 duration-150 ease-in-out">
          {{ isPlaying ? '暂停播放' : '开始播放' }}
        </span>
    </button>
  </Transition>
</template>

<style scoped>
/* Fade transition for entering/leaving */
.fade-enter-active,
.fade-leave-active {
  transition:
    opacity 0.3s ease,
    transform 0.3s ease;
}

.fade-enter-from,
.fade-leave-to {
  opacity: 0;
  transform: translateY(10px);
}

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
