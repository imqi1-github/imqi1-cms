<script setup lang="ts">
import MetingPlayer from "~/components/MetingPlayer.vue";

// 音乐播放器：服务端渲染为 .markdown-music-wrapper 占位，客户端组件化挂载。
// 原实现用 createApp + h(MetingPlayer) 起子实例，这里直接作为组件渲染（框架反模式收敛）。
defineProps<{ server: string; type: string; id: string }>();
</script>

<template>
  <div class="markdown-music">
    <div v-if="id" class="min-h-24">
      <MetingPlayer :id="id" :server="server" :type="type" />
    </div>
    <div v-else class="min-h-24 flex items-center justify-center p-8 border border-slate-200 dark:border-slate-700 rounded-lg">
      <div class="p-4 border border-red-200 dark:border-red-800 bg-red-50 dark:bg-red-900/20 rounded-lg text-red-600 dark:text-red-400">
        无法识别的音乐链接
      </div>
    </div>
  </div>
</template>
