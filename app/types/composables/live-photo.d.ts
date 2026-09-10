export interface LivePhotoMedia {
  /**
   * 内嵌视频的 Blob URL；无内嵌视频（纯静态 JPEG）时为 null。
   * 静态图不在这里返回——调用方始终用原 URL 渲染 `<img>`，不必再造一份等价的 blob。
   */
  videoUrl: string | null;
}
