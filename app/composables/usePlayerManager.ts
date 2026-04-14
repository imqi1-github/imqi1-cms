import { PLAYER_MANAGER_KEY, type PlayerManager } from '~/plugins/player-manager.client';

// 播放器类型
export type PlayerType = 'footer' | 'meting';

// 使用播放器管理器
export function usePlayerManager() {
  const nuxtApp = useNuxtApp();
  // nuxtApp.provide 会将 key 添加 $ 前缀，所以用 $playerManager 访问
  return nuxtApp.$playerManager as PlayerManager | undefined;
}

// 导出类型
export type { PlayerManager };
