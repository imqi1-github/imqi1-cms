import type { LivePhotoMedia } from "~/types/composables/live-photo";

/**
 * 内嵌视频 Blob URL 的会话级缓存（按原图 URL 索引），跨 LivePhoto 实例共享：
 * 文章页与灯箱、灯箱内切上一张/下一张，同一张图命中同一份结果，省掉重复的 fetch + 扫 ftyp。
 *
 * 不接受 AbortSignal——同 src 的请求是共享的，一个调用方取消会连带掐掉别人，
 * 且缓存语义本就与取消冲突（取消了就白干、下次还得重提）。调用方 await 后自行判断
 * 结果还要不要即可。
 */
const videoUrlCache = new Map<string, string | null>();
const inflight = new Map<string, Promise<LivePhotoMedia>>();

/** 释放所有缓存的 Blob URL。路由切换时调用——彼时旧页面的 LivePhoto 都已卸载。 */
const clearLivePhotoVideoCache = () => {
  for (const url of videoUrlCache.values()) {
    if (url) URL.revokeObjectURL(url);
  }
  videoUrlCache.clear();
  inflight.clear();
};

// 实况照片 Composable
export const useLivePhoto = () => {
  const findMotionVideoStart = (bytes: Uint8Array): number => {
    // 查找 ftyp 标记（MP4 文件的起始标记）。偏移 i 处是一整块 MP4 box：
    // bytes[i..i+3] = box size（大端）、bytes[i+4..i+7] = "ftyp"（66 74 79 70）。
    // 用原生 indexOf 粗筛 'f'：逐字节循环扫几十 MB 太慢，memchr 快一个量级；
    // 再校验后三字节与「前置 box size ≥ 8」，JPEG 压缩字节里偶然的 ftyp 序列会被滤掉。
    let p = bytes.indexOf(0x66, 4); // 'f'；下标 4 起，保证 i = p - 4 ≥ 0
    while (p !== -1) {
      // 越界位置读出来是 undefined，比较自然不成立，无需额外判界
      if (bytes[p + 1] === 0x74 && bytes[p + 2] === 0x79 && bytes[p + 3] === 0x70) {
        const i = p - 4;
        const boxSize = (bytes[i]! << 24) | (bytes[i + 1]! << 16) | (bytes[i + 2]! << 8) | bytes[i + 3]!;
        if (boxSize >= 8) return i;
      }
      p = bytes.indexOf(0x66, p + 1);
    }

    return -1;
  };

  /**
   * 提取实况照片内嵌的视频段，返回可直接喂给 `<video>` 的 Blob URL（无内嵌视频时为 null）。
   * 静态图不在这里返回：调用方始终用原 URL 渲染 `<img>`，再造一份 image blob 等于白复制一整包 buffer。
   */
  const extractLivePhotoMedia = async (imgUrl: string): Promise<LivePhotoMedia> => {
    const cached = videoUrlCache.get(imgUrl);
    if (cached !== undefined) return { videoUrl: cached };

    const pending = inflight.get(imgUrl);
    if (pending) return pending;

    const promise = (async (): Promise<LivePhotoMedia> => {
      try {
        const res = await fetch(imgUrl, { cache: "force-cache" });

        if (!res.ok) {
          throw new Error(`实况照片请求失败: ${res.status} ${res.statusText}`);
        }

        // 先取 Blob 再扫：Blob 归浏览器管、切片惰性，比 arrayBuffer → slice → new Blob
        // 那条链路少两次整段拷贝。实况照上限 50MB，这几份拷贝正是切图卡顿的主因。
        const blob = await res.blob();
        const start = findMotionVideoStart(new Uint8Array(await blob.arrayBuffer()));
        if (start === -1) {
          // 带 #live 却没扫到内嵌 MP4：也记一笔，免得每次切到这张都重提整包
          videoUrlCache.set(imgUrl, null);
          return { videoUrl: null };
        }

        const videoUrl = URL.createObjectURL(blob.slice(start, blob.size, "video/mp4"));
        videoUrlCache.set(imgUrl, videoUrl);
        return { videoUrl };
      } catch (e) {
        console.error("[useLivePhoto] 提取实况媒体失败:", e);
        return { videoUrl: null };
      } finally {
        inflight.delete(imgUrl);
      }
    })();

    inflight.set(imgUrl, promise);
    return promise;
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
    isLivePhoto,
    cleanLivePhotoUrl,
  };
};

export { clearLivePhotoVideoCache };
