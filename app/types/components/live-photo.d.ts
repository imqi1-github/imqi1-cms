export type LivePhotoElement = HTMLElement & {
  /**
   * 图片加载完成后的回调函数。
   *
   * - 注册：组件挂载时
   * - 调用：资源加载完成时
   * - 清理：组件卸载时删除
   */
  __livePhotoLoadCallback?: () => void;
};

/** LivePhoto 组件 props；class/width/height/aspectRatio 走 attrs，仅在解码与布局时消费 */
export interface LivePhotoProps {
  src: string;
  alt?: string;
  class?: string;
  hoverPlay?: boolean;
  lazy?: boolean;
  width?: number | string | null;
  height?: number | string | null;
  aspectRatio?: string | null;
  showPlaceholder?: boolean;
}