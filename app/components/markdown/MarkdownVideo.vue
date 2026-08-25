<script setup lang="ts">
// 视频：服务端渲染为 .markdown-video-wrapper 占位，客户端组件化挂载。
defineProps<{ url: string }>();
</script>

<template>
  <div class="markdown-video-container w-full max-w-full m-auto">
    <video
      class="w-full aspect-video rounded-lg shadow-lg max-h-150 bg-slate-100 dark:bg-slate-800"
      controls
      preload="metadata"
    >
      <source :src="url" type="video/mp4">
      您的浏览器不支持视频播放。
    </video>
  </div>
</template>
