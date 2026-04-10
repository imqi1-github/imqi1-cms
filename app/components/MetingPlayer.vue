<script setup lang="ts">
import { ref, onMounted, onBeforeUnmount } from 'vue'

const props = defineProps({
  server: String,
  type: String,
  id: String,
  api: String,
  auth: String,
  auto: String,
  lock: String,
  name: String,
  title: String,
  artist: String,
  author: String,
  url: String,
  cover: String,
  pic: String,
  lyric: String,
  lrc: String,
  // APlayer 选项
  theme: String,
  loop: String,
  order: String,
  preload: String,
  volume: String,
  listFolded: Boolean,
  listMaxHeight: String,
  mutex: Boolean,
  lrcType: Number,
  storageName: String,
})

const container = ref<HTMLElement>()
let APlayer: any = null
let aplayerInstance: any = null

onMounted(async () => {
  if (import.meta.client) {
    // 动态导入 APlayer
    const module = await import('~/lib/aplayer/player.js')
    APlayer = module.default

    // 获取音乐数据
    let audioData: any[] = []

    if (props.url) {
      // 直接使用 URL
      audioData = [{
        name: props.name || props.title || 'Audio name',
        artist: props.artist || props.author || 'Audio artist',
        url: props.url,
        cover: props.cover || props.pic,
        lrc: props.lrc || props.lyric || '',
        type: 'auto',
      }]
    } else if (props.server && props.type && props.id) {
      // 从 API 获取
      const apiUrl = (props.api || '/api/meting?server=:server&type=:type&id=:id')
        .replace(':server', props.server)
        .replace(':type', props.type)
        .replace(':id', props.id)

      try {
        const response = await fetch(apiUrl)
        audioData = await response.json()
      } catch (error) {
        console.error('Failed to fetch music data:', error)
      }
    }

    if (audioData.length === 0) {
      return
    }

    // 初始化 APlayer
    const options: any = {
      container: container.value,
      audio: audioData,
      mutex: props.mutex !== false,
      lrcType: props.lrcType || 3,
      storageName: props.storageName || 'metingjs',
    }

    // 添加可选参数
    if (props.theme) options.theme = props.theme
    if (props.loop) options.loop = props.loop
    if (props.order) options.order = props.order
    if (props.preload) options.preload = props.preload
    if (props.volume) options.volume = parseFloat(props.volume)
    if (props.listFolded) options.listFolded = props.listFolded
    if (props.listMaxHeight) options.listMaxHeight = parseFloat(props.listMaxHeight)

    aplayerInstance = new APlayer(options)
  }
})

onBeforeUnmount(() => {
  if (aplayerInstance) {
    aplayerInstance.destroy()
  }
})
</script>

<template>
  <div ref="container" class="aplayer-container"></div>
</template>

<style scoped>
.aplayer-container {
  line-height: normal;
}
</style>
