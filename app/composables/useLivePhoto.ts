// 实况照片 Composable
export const useLivePhoto = () => {
  /**
   * 从图片文件中提取实况视频
   * 原理：JPEG 文件内部嵌入了一个 MP4 视频，通过查找 "ftyp" 标记来定位
   */
  const extractMotionVideo = async (imgUrl: string, signal?: AbortSignal): Promise<string | null> => {
    try {
      const res = await fetch(imgUrl, {
        cache: "force-cache",
        signal, // ✅ 支持传入 AbortSignal 用于取消请求
      });
      const buffer = await res.arrayBuffer();
      const bytes = new Uint8Array(buffer);

      // 查找 ftyp 标记（MP4 文件的起始标记）
      // ftyp 的十六进制是: 0x66 0x74 0x79 0x70
      let start = -1;
      for (let i = 0; i < bytes.length - 8; i++) {
        if (
          bytes[i + 4] === 0x66 && // f
          bytes[i + 5] === 0x74 && // t
          bytes[i + 6] === 0x79 && // y
          bytes[i + 7] === 0x70 // p
        ) {
          start = i;
          break;
        }
      }

      // 如果没找到 ftyp 标记，说明不是实况照片
      if (start === -1) {
        return null;
      }

      // 提取从 ftyp 开始到文件末尾的所有数据作为视频
      const videoBlob = new Blob([bytes.slice(start)], { type: "video/mp4" });
      return URL.createObjectURL(videoBlob);
    } catch (e) {
      // ✅ 忽略用户主动取消的请求（快速切换页面时的正常行为）
      if (e instanceof DOMException && e.name === "AbortError") {
        return null;
      }
      console.error("[useLivePhoto] 提取实况视频失败:", e);
      return null;
    }
  };

  /**
   * 判断图片 URL 是否为实况照片
   */
  const isLivePhoto = (url: string): boolean => {
    return url.includes("#live");
  };

  /**
   * 清理 URL，移除 #live 锚点
   */
  const cleanLivePhotoUrl = (url: string): string => {
    return url.replace(/#live$/, "");
  };

  return {
    extractMotionVideo,
    isLivePhoto,
    cleanLivePhotoUrl,
  };
};
