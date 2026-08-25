<script setup lang="ts">
// 瀑布流图片：服务端渲染为 .markdown-waterfall-wrapper 占位，客户端组件化挂载。
// 内部图片通过 .markdown-live-photo-mount 由外层 gallery 挂载器统一 hydrate 成 LivePhoto。
defineProps<{ images: Array<{ url: string; caption: string; width: number | null; height: number | null }> }>();
</script>

<template>
  <div class="markdown-waterfall">
    <div class="waterfall-grid">
      <div v-for="(img, i) in images" :key="i" class="waterfall-item">
        <div class="waterfall-img-wrapper" :style="img.width && img.height ? { aspectRatio: `${img.width} / ${img.height}` } : undefined">
          <div
            class="markdown-live-photo-mount"
            :data-src="img.url"
            :data-caption="img.caption || '图片'"
            data-class="waterfall-img"
            :data-aspect-ratio="img.width && img.height ? `${img.width} / ${img.height}` : undefined"
          />
          <div v-if="img.caption" class="waterfall-caption">{{ img.caption }}</div>
        </div>
      </div>
    </div>
  </div>
</template>
