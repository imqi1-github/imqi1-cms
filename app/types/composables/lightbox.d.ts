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

/** 灯箱切图过渡：出场层（上一张图 + 说明文字）的渲染参数 */
export interface LightboxTransition {
  /** 出场图的干净地址；上一张本身就加载失败时为 null——出场层是张 <img>，破图标会从里面冒出来 */
  src: string | null;
  /** 出场图固有尺寸：按它自己的比例铺在舞台上，横竖图互换时才不跳 */
  aspect: { w: number; h: number };
  /** 出场说明文字（换图后 current 已是新图，读不到旧的了） */
  caption: string;
  /** +1 新图自右滑入，-1 自左滑入，0 交叉淡化（远距跳转） */
  dir: -1 | 0 | 1;
  /** 出场层起点位移 px：衔接拖拽手势，让松手后的滑出接着手指走 */
  outFrom: number;
  /** 出场层终点位移 px（滑到另一侧屏外） */
  outTo: number;
  /** 入场层起点位移 px；与出场层恒差一个屏宽，中途不露底色 */
  inFrom: number;
  /** 出场说明文字底边距视口底 px（与入场说明文字同底，只是高度可能不同） */
  captionBottom: number;
}
