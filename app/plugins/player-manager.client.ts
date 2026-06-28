import { ref } from 'vue'

import { defineNuxtPlugin } from '#app'

// 播放器类型
export type PlayerType = 'footer' | 'meting'

// 播放器管理器接口
interface PlayerManager {
  registerPlayer: (type: PlayerType, id: string, pause: () => void) => void
  unregisterPlayer: (type: PlayerType, id: string) => void
  notifyPlay: (type: PlayerType, id: string) => void
}

// 使用字符串 key
const PLAYER_MANAGER_KEY = 'playerManager'

export default defineNuxtPlugin((nuxtApp) => {
  // 存储所有播放器：{ type: { id: pauseFn } }
  const players = ref<Record<PlayerType, Record<string, () => void>>>({
    footer: {},
    meting: {},
  })

  const manager: PlayerManager = {
    // 注册播放器
    registerPlayer(type: PlayerType, id: string, pause: () => void) {
      players.value[type][id] = pause
    },

    // 注销播放器
    unregisterPlayer(type: PlayerType, id: string) {
      delete players.value[type][id]
    },

    // 通知播放：暂停所有其他播放器
    notifyPlay(type: PlayerType, id: string) {
      // 暂停同类型的其他播放器
      const sameTypePlayers = players.value[type]
      if (sameTypePlayers) {
        const entries = Object.entries(sameTypePlayers)
        if (Array.isArray(entries)) {
          entries.forEach(([otherId, pause]) => {
            if (otherId !== id && typeof pause === 'function') {
              try {
                pause()
              } catch (e) {
                console.error('Error pausing player:', e)
              }
            }
          })
        }
      }

      // 暂停其他类型的所有播放器
      const allTypes = Object.keys(players.value) as PlayerType[]
      allTypes.forEach(otherType => {
        if (otherType !== type) {
          const otherTypePlayers = players.value[otherType]
          if (otherTypePlayers) {
            const pauseFns = Object.values(otherTypePlayers)
            if (Array.isArray(pauseFns)) {
              pauseFns.forEach(pause => {
                if (typeof pause === 'function') {
                  try {
                    pause()
                  } catch (e) {
                    console.error('Error pausing player:', e)
                  }
                }
              })
            }
          }
        }
      })
    },
  }

  // 使用 nuxtApp.provide（需要字符串 key）
  nuxtApp.provide(PLAYER_MANAGER_KEY, manager)
})

// 导出类型和 key 常量
export type { PlayerManager }
export { PLAYER_MANAGER_KEY }
