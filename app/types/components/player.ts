/**
 * 音乐播放器类型定义
 */

/** 音乐项（音频文件） */
export interface AudioItem {
  name?: string;
  title?: string;
  artist?: string;
  author?: string;
  cover?: string;
  url?: string;
  lrc?: string;
  pic?: string;
  type?: string;
}

/** Meting 播放器配置选项 */
export interface MetingOptions {
  container?: HTMLElement;
  mini?: boolean;
  fixed?: boolean;
  mutex?: boolean;
  lrcType?: number;
  preload?: string;
  theme?: string;
  loop?: string;
  order?: string;
  volume?: number;
  listFolded?: boolean;
  listMaxHeight?: number;
  audio?: AudioItem[];
  storageName?: string;
}

/** 播放器类型 */
export type PlayerType = 'footer' | 'meting';

/** 播放器管理器 */
export interface PlayerManager {
  id: string;
  type: PlayerType;
  pause: () => void;
  play: () => void;
  toggle: () => void;
}

/** 歌曲（来自 composables） */
export interface Song {
  name: string;
  artist: string;
  url: string;
  pic: string;
  lrc: string;
}