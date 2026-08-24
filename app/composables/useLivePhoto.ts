import type { LivePhotoMedia } from "~/types/composables/live-photo";

// 实况照片 Composable
export const useLivePhoto = () => {
  const emptyMedia = (): LivePhotoMedia => ({
    imageUrl: null,
    videoUrl: null,
  });

  const findMotionVideoStart = (bytes: Uint8Array): number => {
    // 查找 ftyp 标记（MP4 文件的起始标记）。偏移 i 处是一整块 MP4 box：
    // bytes[i..i+3] = box size（大端）、bytes[i+4..i+7] = "ftyp"（66 74 79 70）。
    // 修两点：① 循环上界 length-7 才覆盖到最后一个 8 字节窗口（原 -8 差一位）；
    //   ② 校验「前置 box size ≥ 8」——JPEG 压缩字节里偶然出现的 ftyp 序列会被过滤掉，避免误切片。
    for (let i = 0; i < bytes.length - 7; i++) {
      if (
        bytes[i + 4] === 0x66 && // f
        bytes[i + 5] === 0x74 && // t
        bytes[i + 6] === 0x79 && // y
        bytes[i + 7] === 0x70 // p
      ) {
        // 循环上界已保证 i+7 ≤ length-1，这四个字节索引必在界内（TS 不知道，用 ! 断言）
        const boxSize = (bytes[i]! << 24) | (bytes[i + 1]! << 16) | (bytes[i + 2]! << 8) | bytes[i + 3]!;
        if (boxSize >= 8) return i;
      }
    }

    return -1;
  };

  /**
   * 一次请求中同时得到实况照片静态图和内嵌视频。
   * JPEG 解码器会忽略尾部附加的 MP4 数据，因此完整 buffer 可以直接作为图片 Blob 使用。
   */
  const extractLivePhotoMedia = async (imgUrl: string, signal?: AbortSignal): Promise<LivePhotoMedia> => {
    try {
      const res = await fetch(imgUrl, {
        cache: "force-cache",
        signal, // ✅ 支持传入 AbortSignal 用于取消请求
      });

      if (!res.ok) {
        throw new Error(`实况照片请求失败: ${res.status} ${res.statusText}`);
      }

      const buffer = await res.arrayBuffer();
      const bytes = new Uint8Array(buffer);
      const imageUrl = URL.createObjectURL(new Blob([buffer], { type: "image/jpeg" }));
      const start = findMotionVideoStart(bytes);

      if (start === -1) {
        return {
          imageUrl,
          videoUrl: null,
        };
      }

      const videoBlob = new Blob([bytes.slice(start)], { type: "video/mp4" });
      return {
        imageUrl,
        videoUrl: URL.createObjectURL(videoBlob),
      };
    } catch (e) {
      // ✅ 忽略用户主动取消的请求（快速切换页面时的正常行为）
      if (e instanceof DOMException && e.name === "AbortError") {
        return emptyMedia();
      }
      console.error("[useLivePhoto] 提取实况媒体失败:", e);
      return emptyMedia();
    }
  };

  /**
   * 从图片文件中提取实况视频
   * 原理：JPEG 文件内部嵌入了一个 MP4 视频，通过查找 "ftyp" 标记来定位
   */
  const extractMotionVideo = async (imgUrl: string, signal?: AbortSignal): Promise<string | null> => {
    const media = await extractLivePhotoMedia(imgUrl, signal);
    if (media.imageUrl) {
      URL.revokeObjectURL(media.imageUrl);
    }
    return media.videoUrl;
  };

  /**
   * 判断图片 URL 是否为实况照片。
   * 生产方（useMarkdownImages / slug.vue / MarkdownEditor）一律把 `#live` 追加在 URL 末尾，
   * 故与 cleanLivePhotoUrl 统一用「末尾匹配」语义（旧实现 includes 与 replace(/#live$/) 漂移不一致）。
   */
  const isLivePhoto = (url: string): boolean => {
    return url.endsWith("#live");
  };

  /**
   * 清理 URL，移除 #live 锚点
   */
  const cleanLivePhotoUrl = (url: string): string => {
    return url.endsWith("#live") ? url.slice(0, -"#live".length) : url;
  };

  return {
    extractLivePhotoMedia,
    extractMotionVideo,
    isLivePhoto,
    cleanLivePhotoUrl,
  };
};
