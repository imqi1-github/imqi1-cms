<script setup lang="ts">
import { ref } from 'vue'

// 测试直接使用 URL
const testAudio = ref({
  name: '海阔天空',
  artist: 'Beyond',
  url: 'https://music.163.com/song/media/outer/url?id=347230.mp3',
  cover: 'https://p2.music.126.net/iAwVf8ag_45csIUuh1wSZg==/109951168912558470.jpg',
  lrc: '',
  type: 'auto',
})
</script>

<template>
  <div class="container mx-auto py-12 px-4">
    <h1 class="text-3xl font-bold mb-8">音乐播放器测试</h1>

    <div class="space-y-8">
      <div>
        <h2 class="text-xl font-semibold mb-4">测试 1: 直接 URL</h2>
        <MetingPlayer
          :url="testAudio.url"
          :name="testAudio.name"
          :artist="testAudio.artist"
          :cover="testAudio.cover"
        />
      </div>

      <div>
        <h2 class="text-xl font-semibold mb-4">测试 2: 从 API 获取歌单</h2>
        <MetingPlayer
          server="netease"
          type="playlist"
          id="3778678"
        />
      </div>

      <div>
        <h2 class="text-xl font-semibold mb-4">测试 3: 从 API 获取单曲</h2>
        <MetingPlayer
          server="netease"
          type="song"
          id="347230"
        />
      </div>
    </div>
  </div>
</template>
