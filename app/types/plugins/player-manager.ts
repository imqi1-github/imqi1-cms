// 播放器类型
export type PlayerType = 'footer' | 'meting'

// 播放器管理器接口
export interface PlayerManager {
  registerPlayer: (type: PlayerType, id: string, pause: () => void) => void
  unregisterPlayer: (type: PlayerType, id: string) => void
  notifyPlay: (type: PlayerType, id: string) => void
}