export type APlayerLoop = 'none' | 'one' | 'all';
export type APlayerOrder = 'list' | 'random';
export type APlayerPreload = 'none' | 'metadata' | 'auto';

/**
 * 单首音频;含 options 归一化时消费的旧别名(title/author/pic)
 */
export interface APlayerAudio {
  name?: string;
  artist?: string;
  cover?: string;
  url?: string;
  lrc?: string;
  type?: string; // 'auto' | 'normal' | 'hls' | 自定义
  theme?: string;
  title?: string; // legacy 别名
  author?: string; // legacy 别名
  pic?: string; // legacy 别名
}

/**
 * handleOption 的输入:全部可选(组件按需填)
 */
export interface APlayerOptions {
  container?: HTMLElement;
  mini?: boolean;
  fixed?: boolean;
  mutex?: boolean;
  lrcType?: number | boolean;
  preload?: APlayerPreload;
  theme?: string;
  loop?: APlayerLoop;
  order?: APlayerOrder;
  volume?: number;
  listFolded?: boolean;
  listMaxHeight?: number | string;
  audio?: APlayerAudio | APlayerAudio[];
  storageName?: string;
  customAudioType?: Record<string, (audio: HTMLAudioElement, item: APlayerAudio, player: unknown) => void>;
  // 旧 API 别名(options 读取)
  element?: HTMLElement;
  narrow?: boolean;
  showlrc?: number | boolean;
  lrc?: number | boolean;
  music?: APlayerAudio | APlayerAudio[];
  listmaxheight?: number | string;
}

/**
 * handleOption 的输出:字段已填默认值
 */
export interface ResolvedAPlayerOptions {
  container: HTMLElement;
  mini: boolean;
  fixed: boolean;
  mutex: boolean;
  lrcType: number | boolean;
  preload: APlayerPreload;
  theme: string;
  loop: APlayerLoop;
  order: APlayerOrder;
  volume: number;
  listFolded: boolean;
  listMaxHeight: number;
  audio: APlayerAudio[];
  storageName: string;
  customAudioType?: Record<string, (audio: HTMLAudioElement, item: APlayerAudio, player: unknown) => void>;
}

/**
 * window.Hls(hls.js 经 CDN 外部注入,非 npm 依赖)最小结构类型
 */
export interface HlsInstance {
  loadSource(url: string): void;
  attachMedia(media: HTMLAudioElement): void;
  destroy(): void;
}

export interface HlsStatic {
  new (): HlsInstance;
  isSupported(): boolean;
}

// ===== 内部实现类型(aplayer 模块内使用) =====

export type BarType = 'volume' | 'played' | 'loaded';

export type BarDirection = 'width' | 'height';

/** 拖拽事件:鼠标或触摸(controller 拖拽进度/音量条) */
export type DragEvent = MouseEvent | TouchEvent;

export type EventHandler = (data?: unknown) => void;

/** 解析后的歌词行:[时间秒, 文本] */
export type LrcLine = [number, string];

declare global {
  interface Window {
    Hls?: HlsStatic;
  }
}
