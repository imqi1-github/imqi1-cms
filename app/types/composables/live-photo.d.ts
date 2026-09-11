export interface LivePhotoMedia {
  /**
   * 内嵌视频的 Blob URL；无内嵌视频（纯静态 JPEG）时为 null。
   */
  videoUrl: string | null;
  /**
   * 静态图的 Blob URL，与视频同出一份已取回的字节（JPEG 段切出来），切不出时为 null。
   * 有了它，图片和视频一起到，不会再出现「视频已就绪、图还在下载」的错帧，也省掉一次请求。
   */
  imageUrl: string | null;
}
