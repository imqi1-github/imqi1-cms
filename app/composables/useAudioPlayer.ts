import { usePlayerManager } from "./usePlayerManager";

import type { Song } from "~/types/composables/song";

// ===== 模块级：仅客户端使用的单例资源 =====
// 这些不参与 SSR 渲染（SSR 期间从不被读取或修改），可安全放在模块顶层：
// - audio 仅在客户端 createAudio 中 new Audio() 创建，服务端恒为 null
// - isInitialized / playerId 仅在客户端 initPlayer / 事件回调中使用

// Audio 实例（全局唯一，仅客户端）
let audio: HTMLAudioElement | null = null;

// 初始化标志（客户端单例守卫，防止重复初始化）
let isInitialized = false;

// 播放器实例 ID（用于播放器管理器）
const playerId = `footer-${Date.now()}-${Math.random()}`;

// 音乐播放器失败计数相关常量（歌单拉取失败 + 单首播放卡顿/失败共用同一计数）
const METING_FAILURE_COUNT_KEY = "meting_api_failure_count";
const MAX_FAILURE_COUNT = 3;

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

// 获取播放器管理器
function getPlayerManager() {
  if (import.meta.client) {
    return usePlayerManager();
  }
  return null;
}

// ===== Composable：SSR 安全的共享状态 + 操作方法 =====
// 用 useState 替代模块级 ref：服务端按请求隔离，客户端跨组件单例共享，
// 避免 SSR 时多个请求共享同一份模块级 ref 导致串号。
export function useAudioPlayer() {
  // 共享响应式状态（SSR 安全）
  const playlist = useState<Song[]>("audio:playlist", () => []);
  const currentSong = useState<Song | null>("audio:currentSong", () => null);
  const isPlaying = useState<boolean>("audio:isPlaying", () => false);
  const isLoaded = useState<boolean>("audio:isLoaded", () => false);
  const progress = useState<number>("audio:progress", () => 0);
  const shouldAutoPlay = useState<boolean>("audio:shouldAutoPlay", () => false);
  const playedIndices = useState<number[]>("audio:playedIndices", () => []);

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
    if (randomIndex === undefined) return null;

    playedIndices.value.push(randomIndex);

    return playlist.value[randomIndex] ?? null;
  }

  // 事件处理函数（同一闭包内引用稳定，供 add/removeEventListener 配对使用）
  const updateProgress = () => {
    if (!audio) return;
    const duration = audio.duration || 0;
    const currentTime = audio.currentTime || 0;
    progress.value = duration > 0 ? (currentTime / duration) * 100 : 0;
  };

  // 连续失败达到上限：停止切歌、隐藏胶囊、暂停音频。
  // 播放卡顿/失败多为瞬时网络问题，故重置计数——刷新后自动重试，
  // 且不污染 initPlayer 的「歌单 API 拉取闸门」（该闸门只对真正的 API 失败持久生效）。
  function disablePlayer(reason: string) {
    console.warn(`${reason}，本次停用页脚音乐，刷新页面后将自动重试`);
    shouldAutoPlay.value = false;
    isPlaying.value = false;
    currentSong.value = null;
    isLoaded.value = false;
    if (audio) {
      audio.pause();
    }
    resetFailureCount();
  }

  const handleSongEnd = () => {
    shouldAutoPlay.value = true;
    playNext();
  };

  // error 与 stalled 处理逻辑一致，仅文案不同，合并为单一实现避免重复维护
  function handleSongProblem(reason: string, disableReason: string) {
    console.warn(reason);
    const newCount = incrementFailureCount();
    if (newCount >= MAX_FAILURE_COUNT) {
      disablePlayer(`${disableReason} ${newCount} 次`);
      return;
    }
    shouldAutoPlay.value = isPlaying.value;
    playNext();
  }

  const handleSongError = () => handleSongProblem("歌曲加载失败，切换下一首", "歌曲连续加载失败");
  const handleSongStalled = () => handleSongProblem("网络卡顿，切换下一首", "网络连续卡顿");

  const handleCanPlayThrough = () => {
    if (shouldAutoPlay.value && audio) {
      audio.play().catch(err => {
        console.error("播放失败:", err);
      });
    }
  };

  const handlePlaying = () => {
    isPlaying.value = true;
    shouldAutoPlay.value = false;

    // 成功播放，重置连续失败计数（与歌单拉取成功一致），避免偶发卡顿冤枉累积
    resetFailureCount();

    // 通知播放器管理器，暂停其他所有播放器
    const manager = getPlayerManager();
    if (manager) {
      manager.notifyPlay("footer", playerId);
    }
  };

  const handlePause = () => {
    isPlaying.value = false;
    shouldAutoPlay.value = false;
  };

  // canplay 一次性监听 —— 保存引用以便 cleanup 时移除，避免 teardown 时仍在加载导致卸载后 audio.play()
  const playWhenReady = () => {
    if (shouldAutoPlay.value && audio) {
      audio.play().catch(err => {
        console.error("自动播放下一首失败:", err);
      });
    }
    audio?.removeEventListener("canplay", playWhenReady);
  };

  // 统一挂载/卸载 audio 事件，避免 createAudio 与 cleanup 各维护一份相同的监听列表
  function attachAudioListeners(el: HTMLAudioElement) {
    el.addEventListener("timeupdate", updateProgress);
    el.addEventListener("ended", handleSongEnd);
    el.addEventListener("error", handleSongError);
    el.addEventListener("stalled", handleSongStalled);
    el.addEventListener("canplaythrough", handleCanPlayThrough);
    el.addEventListener("playing", handlePlaying);
    el.addEventListener("pause", handlePause);
  }

  function detachAudioListeners(el: HTMLAudioElement) {
    el.removeEventListener("timeupdate", updateProgress);
    el.removeEventListener("ended", handleSongEnd);
    el.removeEventListener("error", handleSongError);
    el.removeEventListener("stalled", handleSongStalled);
    el.removeEventListener("canplaythrough", handleCanPlayThrough);
    el.removeEventListener("playing", handlePlaying);
    el.removeEventListener("pause", handlePause);
  }

  // 创建 Audio 实例
  function createAudio(song: Song) {
    // 销毁旧的实例
    if (audio) {
      audio.pause();
      detachAudioListeners(audio);
    }

    // 创建新实例
    audio = new Audio(song.url);
    audio.preload = "auto";

    // 绑定事件
    attachAudioListeners(audio);
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
      manager.registerPlayer("footer", playerId, () => {
        if (audio) {
          audio.pause();
        }
      });
    }

    try {
      const response = await $fetch<Song[]>(`/api/meting?type=playlist&server=${playlistConfig.server}&id=${playlistConfig.id}`);

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

  // 播放/暂停切换
  function togglePlay() {
    if (!audio || !currentSong.value) return;

    if (isPlaying.value) {
      audio.pause();
      shouldAutoPlay.value = false;
      return;
    }

    // 直接 play()：未就绪时浏览器自行排队、就绪即播，避免旧实现「只设乐观状态
    // 不 play、干等 canplaythrough」造成的 UI 显示播放却迟迟无声。
    shouldAutoPlay.value = true;
    isPlaying.value = true;
    audio.play().catch(err => {
      console.error("播放失败:", err);
      isPlaying.value = false;
      shouldAutoPlay.value = false;
    });
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

        audio.addEventListener("canplay", playWhenReady);
      }
    }
  }

  // 暂停
  function pause() {
    if (audio) {
      audio.pause();
    }
  }

  // 清理资源
  function cleanup() {
    // 从播放器管理器中注销
    const manager = getPlayerManager();
    if (manager) {
      manager.unregisterPlayer("footer", playerId);
    }

    if (audio) {
      audio.pause();
      detachAudioListeners(audio);
      audio.removeEventListener("canplay", playWhenReady);
    }
  }

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
    pause,
  };
}
