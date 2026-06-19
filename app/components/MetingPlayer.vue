<script setup lang="ts">
import { ref, onMounted, onBeforeUnmount } from 'vue'
import { usePlayerManager } from '~/composables/usePlayerManager'
import "~/assets/css/aplayer.css"

// 获取播放器管理器
const playerManager = usePlayerManager()

// 播放器实例 ID（用于管理器）
const playerId = `meting-${Date.now()}-${Math.random()}`

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
// 标记组件是否已卸载
let isUnmounted = false

onMounted(async () => {
  if (import.meta.client) {
    // 动态导入 APlayer
    const module = await import('~/lib/aplayer/player.js')
    APlayer = module.default

    // ✅ 异步操作后检查：组件已卸载则直接返回
    if (isUnmounted || !container.value) {
      return
    }

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

    // ✅ 异步操作后再次检查
    if (isUnmounted || !container.value || audioData.length === 0) {
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

    // 将实例引用存储到容器元素上，方便其他播放器访问
    if (container.value) {
      (container.value as any).__aplayer__ = aplayerInstance
    }

    // 注册到播放器管理器
    if (playerManager) {
      playerManager.registerPlayer('meting', playerId, () => {
        if (aplayerInstance) {
          aplayerInstance.pause()
        }
      })
    }

    // 监听播放事件，确保互斥
    aplayerInstance.on('play', () => {
      // 通知播放器管理器，暂停其他所有播放器
      if (playerManager) {
        playerManager.notifyPlay('meting', playerId)
      }
    })
  }
})

onBeforeUnmount(() => {
  // ✅ 先标记为已卸载
  isUnmounted = true

  // 从播放器管理器中注销
  if (playerManager) {
    playerManager.unregisterPlayer('meting', playerId)
  }

  if (aplayerInstance) {
    aplayerInstance.destroy()
    aplayerInstance = null
  }
  // 清理容器上的引用
  if (container.value) {
    delete (container.value as any).__aplayer__
  }
})
</script>

<template>
  <div ref="container" class="aplayer-container **:duration-300"></div>
</template>

<style scoped>
.aplayer-container {
  line-height: normal;
}
</style>
