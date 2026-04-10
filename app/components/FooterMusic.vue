<script setup lang="ts">
import { ref, computed, onMounted, onUnmounted } from "vue";

// 获取站点设置
const { data: settingsData } = await useFetch("/api/site");
const settings = computed(() => settingsData.value?.data);

// 解析音乐播放列表 ID
const playlistConfig = computed(() => {
  const config = settings.value?.musicPlaylistId || "9255074836 || netease";
  const [id, server = "netease"] = config.split("||").map((s: string) => s.trim());
  return { id, server };
});

// 音乐数据
interface Song {
  name: string;
  artist: string;
  url: string;
  pic: string;
  lrc: string;
}

const playlist = ref<Song[]>([]);
const currentSong = ref<Song | null>(null);
const isPlaying = ref(false);
const isLoaded = ref(false);
const progress = ref(0);

// Audio 实例
let audio: HTMLAudioElement | null = null;

// 已播放的歌曲索引列表
const playedIndices = ref<number[]>([]);

// 获取下一首未播放的歌曲
function getNextSong(): Song | null {
  if (playlist.value.length === 0) return null;

  // 如果所有歌曲都播放过了，重置记录
  if (playedIndices.value.length >= playlist.value.length) {
    playedIndices.value = [];
  }

  // 从未播放的歌曲中随机选择
  const availableIndices = playlist.value.map((_, index) => index).filter(index => !playedIndices.value.includes(index));

  const randomIndex = availableIndices[Math.floor(Math.random() * availableIndices.length)];
  playedIndices.value.push(randomIndex);

  return playlist.value[randomIndex];
}

// 初始化播放器
async function initPlayer() {
  if (!playlistConfig.value.id) return;

  try {
    const response = await $fetch<any>(`/api/meting?type=playlist&server=${playlistConfig.value.server}&id=${playlistConfig.value.id}`);

    if (response && Array.isArray(response)) {
      playlist.value = response;
      // 准备第一首歌
      const firstSong = getNextSong();
      if (firstSong) {
        currentSong.value = firstSong;
        createAudio(firstSong);
      }
      isLoaded.value = true;
    }
  } catch (error) {
    console.error("加载音乐列表失败:", error);
  }
}

// 创建 Audio 实例
function createAudio(song: Song) {
  // 销毁旧的实例
  if (audio) {
    audio.pause();
    audio.removeEventListener("timeupdate", updateProgress);
    audio.removeEventListener("ended", handleSongEnd);
    audio.removeEventListener("error", handleSongError);
    audio.removeEventListener("stalled", handleSongStalled);
    audio.removeEventListener("canplaythrough", handleCanPlayThrough);
    audio.removeEventListener("playing", handlePlaying);
    audio.removeEventListener("pause", handlePause);
  }

  // 创建新实例
  audio = new Audio(song.url);
  audio.preload = "auto";

  // 绑定事件
  audio.addEventListener("timeupdate", updateProgress);
  audio.addEventListener("ended", handleSongEnd);
  audio.addEventListener("error", handleSongError);
  audio.addEventListener("stalled", handleSongStalled);
  audio.addEventListener("canplaythrough", handleCanPlayThrough);
  audio.addEventListener("playing", handlePlaying);
  audio.addEventListener("pause", handlePause);
}

// 更新进度条
const updateProgress = () => {
  if (!audio) return;
  const duration = audio.duration || 0;
  const currentTime = audio.currentTime || 0;
  progress.value = duration > 0 ? (currentTime / duration) * 100 : 0;
};

// 歌曲播放完毕，切换下一首
const handleSongEnd = () => {
  playNext();
};

// 歌曲加载失败，切换下一首
const handleSongError = () => {
  console.warn("歌曲加载失败，切换下一首");
  playNext();
};

// 网络卡顿，切换下一首
const handleSongStalled = () => {
  console.warn("网络卡顿，切换下一首");
  playNext();
};

// 音频可以播放
const handleCanPlayThrough = () => {
  if (isPlaying.value && audio) {
    audio.play().catch(err => {
      console.error("播放失败:", err);
    });
  }
};

// 正在播放
const handlePlaying = () => {
  isPlaying.value = true;
  // 暂停所有正文中的播放器
  pauseAllMetingPlayers();
};

// 已暂停
const handlePause = () => {
  isPlaying.value = false;
};

// 暂停所有正文中的 Meting 播放器
function pauseAllMetingPlayers() {
  if (import.meta.client) {
    const metingPlayers = document.querySelectorAll("meting-js");
    metingPlayers.forEach(player => {
      if ((player as any).aplayer) {
        (player as any).aplayer.pause();
      }
    });
  }
}

// 播放/暂停切换
function togglePlay() {
  if (!audio || !currentSong.value) return;

  if (isPlaying.value) {
    audio.pause();
  } else {
    // 如果音频已准备好，直接播放
    if (audio.readyState >= 3) {
      audio.play().catch(err => {
        console.error("播放失败:", err);
      });
    } else {
      // 否则等待加载完成
      isPlaying.value = true;
    }
  }
}

// 播放下一首
function playNext() {
  const nextSong = getNextSong();
  if (nextSong) {
    currentSong.value = nextSong;
    progress.value = 0;
    createAudio(nextSong);

    if (isPlaying.value) {
      // 等待音频加载完成后再播放
      audio?.load();
    }
  }
}

// 暴露暂停方法（供外部调用）
defineExpose({
  pause: () => {
    if (audio) {
      audio.pause();
    }
  },
});

onMounted(() => {
  initPlayer();
});

onUnmounted(() => {
  if (audio) {
    audio.pause();
    audio.removeEventListener("timeupdate", updateProgress);
    audio.removeEventListener("ended", handleSongEnd);
    audio.removeEventListener("error", handleSongError);
    audio.removeEventListener("stalled", handleSongStalled);
    audio.removeEventListener("canplaythrough", handleCanPlayThrough);
    audio.removeEventListener("playing", handlePlaying);
    audio.removeEventListener("pause", handlePause);
  }
});
</script>

<template>
  <Transition v-if="isLoaded && currentSong" name="fade">
    <button
      @click="togglePlay"
      class="group relative flex items-center gap-2 rounded-full border border-gray-200 bg-white py-0.75 pr-0.75 pl-2 shadow-sm transition-all duration-300 hover:shadow-md dark:border-gray-700 dark:bg-slate-800 overflow-hidden max-w-36 h-7.5"
      :class="{
        'hover:bg-gray-100 dark:hover:bg-slate-700': true,
      }"
      :title="isPlaying ? '暂停播放' : '开始播放'">
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
        class="relative z-1 h-full shrink-0 rounded-full object-cover bg-gray-100 dark:bg-gray-700"
        :class="{ 'spin-slow': isPlaying }"
        loading="lazy" />
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
  animation: spin 16s linear infinite;
}
</style>
