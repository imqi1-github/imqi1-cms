import { ref, computed } from "vue";
import { usePlayerManager } from "./usePlayerManager";

// 音乐数据
interface Song {
  name: string;
  artist: string;
  url: string;
  pic: string;
  lrc: string;
}

// 全局共享状态
const playlist = ref<Song[]>([]);
const currentSong = ref<Song | null>(null);
const isPlaying = ref(false);
const isLoaded = ref(false);
const progress = ref(0);
const shouldAutoPlay = ref(false);

// Audio 实例（全局唯一）
let audio: HTMLAudioElement | null = null;

// 已播放的歌曲索引列表
const playedIndices = ref<number[]>([]);

// 初始化标志
let isInitialized = false;

// Meting API 失败计数相关常量
const METING_FAILURE_COUNT_KEY = 'meting_api_failure_count';
const MAX_FAILURE_COUNT = 5;

// 获取失败次数
function getFailureCount(): number {
  if (import.meta.client) {
    const count = localStorage.getItem(METING_FAILURE_COUNT_KEY);
    return count ? parseInt(count, 10) : 0;
  }
  return 0;
}

// 增加失败次数
function incrementFailureCount() {
  if (import.meta.client) {
    const currentCount = getFailureCount();
    const newCount = currentCount + 1;
    localStorage.setItem(METING_FAILURE_COUNT_KEY, newCount.toString());
    return newCount;
  }
  return 0;
}

// 重置失败次数
function resetFailureCount() {
  if (import.meta.client) {
    localStorage.removeItem(METING_FAILURE_COUNT_KEY);
  }
}

// 播放器实例 ID（用于管理器）
const playerId = `footer-${Date.now()}-${Math.random()}`;

// 获取播放器管理器
function getPlayerManager() {
  if (import.meta.client) {
    return usePlayerManager();
  }
  return null;
}

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
async function initPlayer(playlistConfig: { id: string; server: string }) {
  if (isInitialized) return;
  isInitialized = true;

  if (!playlistConfig.id) return;

  // 检查失败次数，如果超过最大次数则不初始化播放器
  const failureCount = getFailureCount();
  if (failureCount >= MAX_FAILURE_COUNT) {
    console.warn(`Meting API 已连续失败 ${failureCount} 次，不再加载音乐播放器。如需重试，请清除 localStorage 中的 ${METING_FAILURE_COUNT_KEY}`);
    return;
  }

  // 注册到播放器管理器
  const manager = getPlayerManager();
  if (manager) {
    manager.registerPlayer('footer', playerId, () => {
      if (audio) {
        audio.pause();
      }
    });
  }

  try {
    const response = await $fetch<any>(`/api/meting?type=playlist&server=${playlistConfig.server}&id=${playlistConfig.id}`);

    if (response && Array.isArray(response)) {
      // 请求成功，重置失败计数
      resetFailureCount();

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
    // 增加失败计数
    const newCount = incrementFailureCount();
    console.warn(`Meting API 失败次数: ${newCount}/${MAX_FAILURE_COUNT}`);

    // 如果达到最大失败次数，不显示播放器
    if (newCount >= MAX_FAILURE_COUNT) {
      console.warn(`Meting API 已连续失败 ${MAX_FAILURE_COUNT} 次，音乐播放器已禁用`);
    }
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
  shouldAutoPlay.value = true;
  playNext();
};

// 歌曲加载失败，切换下一首
const handleSongError = () => {
  console.warn("歌曲加载失败，切换下一首");
  shouldAutoPlay.value = isPlaying.value;
  playNext();
};

// 网络卡顿，切换下一首
const handleSongStalled = () => {
  console.warn("网络卡顿，切换下一首");
  shouldAutoPlay.value = isPlaying.value;
  playNext();
};

// 音频可以播放
const handleCanPlayThrough = () => {
  if (shouldAutoPlay.value && audio) {
    audio.play().catch(err => {
      console.error("播放失败:", err);
    });
  }
};

// 正在播放
const handlePlaying = () => {
  isPlaying.value = true;
  shouldAutoPlay.value = false;

  // 通知播放器管理器，暂停其他所有播放器
  const manager = getPlayerManager();
  if (manager) {
    manager.notifyPlay('footer', playerId);
  }
};

// 已暂停
const handlePause = () => {
  isPlaying.value = false;
  shouldAutoPlay.value = false;
};

// 播放/暂停切换
function togglePlay() {
  if (!audio || !currentSong.value) return;

  if (isPlaying.value) {
    audio.pause();
    shouldAutoPlay.value = false;
  } else {
    shouldAutoPlay.value = true;
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

    // 如果标记了应该自动播放，等待音频准备好后播放
    if (shouldAutoPlay.value && audio) {
      audio.load();

      // 监听 canplay 事件，确保音频可以播放后再开始播放
      const playWhenReady = () => {
        if (shouldAutoPlay.value && audio) {
          audio.play().catch(err => {
            console.error("自动播放下一首失败:", err);
          });
        }
        audio?.removeEventListener("canplay", playWhenReady);
      };

      audio.addEventListener("canplay", playWhenReady);
    }
  }
}

// 清理资源
function cleanup() {
  // 从播放器管理器中注销
  const manager = getPlayerManager();
  if (manager) {
    manager.unregisterPlayer('footer', playerId);
  }

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
}

// 导出全局状态和方法
export function useAudioPlayer() {
  return {
    playlist,
    currentSong,
    isPlaying,
    isLoaded,
    progress,
    initPlayer,
    togglePlay,
    playNext,
    cleanup,
    pause: () => {
      if (audio) {
        audio.pause();
      }
    },
  };
}
