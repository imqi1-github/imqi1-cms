/** 灯箱幻灯片：从触发元素（`[data-fancybox]`）解析出的自包含数据 */
export interface LightboxSlide {
  /** 原图地址；实况照片带 `#live` 后缀（LivePhoto 据此识别） */
  src: string;
  /** 去掉 `#live` 的干净地址，用于缩略图条与开合动画 */
  cleanSrc: string;
  alt: string;
  caption: string;
  isLive: boolean;
  /** 固有尺寸，用于 FLIP 动画与旋转后的重新适配；未知时为 null */
  width: number | null;
  height: number | null;
}

export interface LightboxState {
  slides: LightboxSlide[];
  index: number;
}
