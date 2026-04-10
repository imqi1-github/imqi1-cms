<script setup lang="ts">
import { ref, onMounted } from 'vue'
import { renderMarkdown } from '~/server/utils/markdown'

const testContent = `# 音乐链接自动识别测试

## 网易云音乐

### 播放列表
[网易云音乐热歌榜](https://music.163.com/playlist?id=3778678)

### 单曲
[海阔天空](https://music.163.com/song?id=347230)

### 专辑
[Beyond 精选集](https://music.163.com/album?id=101993)

## QQ音乐

### 播放列表
[QQ音乐热歌榜](https://y.qq.com/n/ryqq/playlist/8295590931)

### 单曲
[孤勇者](https://y.qq.com/n/ryqq/songDetail/002J8XZl1BmYVj)

### 专辑
[周杰伦的床边故事](https://y.qq.com/n/ryqq/albumDetail/002xQd3633x14m)

## 酷我音乐

### 播放列表
[酷我音乐热歌榜](https://www.kuwo.cn/playlist/3671026083)

### 单曲
[起风了](https://www.kuwo.cn/song/148647761)

### 专辑
[起风了](https://www.kuwo.cn/album/8744763)

## 酷狗音乐

### 单曲
[光年之外](https://www.kugou.com/song/5d8c3a4411b62e684e0a7e7c4c9c8c34.html)

### 专辑
[邓紫棋精选](https://www.kugou.com/album/4523701.html)

### 播放列表
[酷狗音乐热歌榜](https://www.kugou.com/playlist/5328759860.html)

## 普通链接（不应该被转换）
[百度](https://www.baidu.com)
[谷歌](https://www.google.com)
`

const renderedContent = ref('')

onMounted(async () => {
  renderedContent.value = await renderMarkdown(testContent)
})
</script>

<template>
  <div class="container mx-auto py-12 px-4">
    <h1 class="text-3xl font-bold mb-8">音乐链接自动识别测试</h1>

    <div class="bg-white dark:bg-slate-800 rounded-lg p-6 shadow-md">
      <h2 class="text-xl font-semibold mb-4">测试内容</h2>
      <pre class="bg-slate-100 dark:bg-slate-900 p-4 rounded text-sm overflow-auto">{{ testContent }}</pre>
    </div>

    <div class="mt-8">
      <h2 class="text-xl font-semibold mb-4">渲染结果</h2>
      <div v-if="renderedContent" class="markdown-body" v-html="renderedContent"></div>
      <div v-else class="text-center py-8">
        <div class="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600 mx-auto"></div>
        <p class="mt-2 text-slate-500">渲染中...</p>
      </div>
    </div>
  </div>
</template>

<style scoped>
.markdown-body {
  line-height: 1.8;
}

.markdown-body h2 {
  margin-top: 2rem;
  margin-bottom: 1rem;
  font-size: 1.5rem;
  font-weight: 600;
}

.markdown-body h3 {
  margin-top: 1.5rem;
  margin-bottom: 0.75rem;
  font-size: 1.25rem;
  font-weight: 500;
}

.markdown-body p {
  margin-bottom: 1rem;
}
</style>