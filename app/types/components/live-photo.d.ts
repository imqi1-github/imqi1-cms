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