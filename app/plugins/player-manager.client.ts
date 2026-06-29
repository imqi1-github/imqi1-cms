import { ref } from "vue";

import { defineNuxtPlugin } from "#app";
import type { PlayerManager, PlayerType } from "~/types/plugins/player-manager";

// 使用字符串 key
const PLAYER_MANAGER_KEY = "playerManager";

export default defineNuxtPlugin(nuxtApp => {
  // 存储所有播放器：{ type: { id: pauseFn } }
  const players = ref<Record<PlayerType, Map<string, () => void>>>({
    footer: new Map(),
    meting: new Map(),
  });

  const manager: PlayerManager = {
    // 注册播放器
    registerPlayer(type: PlayerType, id: string, pause: () => void) {
      players.value[type].set(id, pause);
    },

    // 注销播放器
    unregisterPlayer(type: PlayerType, id: string) {
      players.value[type].delete(id);
    },

    // 通知播放：暂停所有其他播放器
    notifyPlay(type: PlayerType, id: string) {
      // 暂停同类型的其他播放器
      const sameTypePlayers = players.value[type];

      sameTypePlayers.forEach((pause, otherId) => {
        if (otherId !== id) {
          try {
            pause();
          } catch (e) {
            console.error("Error pausing player:", e);
          }
        }
      });

      // 暂停其他类型的所有播放器
      const allTypes = Object.keys(players.value) as PlayerType[];

      allTypes.forEach(otherType => {
        if (otherType !== type) {
          players.value[otherType].forEach(pause => {
            try {
              pause();
            } catch (e) {
              console.error("Error pausing player:", e);
            }
          });
        }
      });
    },
  };

  // 使用 nuxtApp.provide（需要字符串 key）
  nuxtApp.provide(PLAYER_MANAGER_KEY, manager);
});

// 导出类型和 key 常量
export { PLAYER_MANAGER_KEY };
