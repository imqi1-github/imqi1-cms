import type { LivePhotoMedia } from "~/types/composables/live-photo";

/**
 * 内嵌视频 / 静态图 Blob URL 的会话级缓存（按原图 URL 索引），跨 LivePhoto 实例共享：
 * 文章页与灯箱、灯箱内切上一张/下一张，同一张图命中同一份结果，省掉重复的 fetch + 扫 ftyp。
 *
 * 不接受 AbortSignal——同 src 的请求是共享的，一个调用方取消会连带掐掉别人，
 * 且缓存语义本就与取消冲突（取消了就白干、下次还得重提）。调用方 await 后自行判断
 * 结果还要不要即可。
 */
const videoUrlCache = new Map<string, string | null>();
const imageUrlCache = new Map<string, string>();
const inflight = new Map<string, Promise<LivePhotoMedia>>();
/**
 * 代际号，清理时自增。清理前启动的提取跑完时若代际已变，就把结果就地丢弃并 revoke——
 * 否则会把刚 revoke 的 blob 又写回 Map（下一次路由切换前谁也 revoke 不掉它），
 * 而 `inflight.delete` 也会误删后来者的 promise，导致同一个 URL 被重复 fetch。
 */
let cacheEpoch = 0;

/** 释放所有缓存的 Blob URL。路由切换时调用——彼时旧页面的 LivePhoto 都已卸载。 */
const clearLivePhotoMediaCache = () => {
  cacheEpoch++;
  for (const url of videoUrlCache.values()) {
    if (url) URL.revokeObjectURL(url);
  }
  for (const url of imageUrlCache.values()) URL.revokeObjectURL(url);
  videoUrlCache.clear();
  imageUrlCache.clear();
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
   * 提取实况照片的静态图与内嵌视频段，返回可直接喂给 `<img>` / `<video>` 的 Blob URL。
   * 两者同出一份已取回的字节，故「视频已就绪、图还在下载」的错帧不存在，也省掉图片那次请求。
   *
   * 注意 `imageUrl` 没有直接读取方：它只进 `imageUrlCache`，由 `peekLivePhotoImageUrl` 在
   * 「换源那一刻」同步取用（见该函数注释）。别因为它无人解构就当死代码删掉。
   */
  const extractLivePhotoMedia = async (imgUrl: string): Promise<LivePhotoMedia> => {
    const cached = videoUrlCache.get(imgUrl);
    if (cached !== undefined) return { videoUrl: cached, imageUrl: imageUrlCache.get(imgUrl) ?? null };

    const pending = inflight.get(imgUrl);
    if (pending) return pending;

    const promise = (async (): Promise<LivePhotoMedia> => {
      const epoch = cacheEpoch;
      try {
        const res = await fetch(imgUrl, { cache: "force-cache" });

        if (!res.ok) {
          throw new Error(`实况照片请求失败: ${res.status} ${res.statusText}`);
        }

        // 先取 Blob 再扫：Blob 归浏览器管、切片惰性，比 arrayBuffer → slice → new Blob
        // 那条链路少两次整段拷贝。实况照上限 50MB，这几份拷贝正是切图卡顿的主因。
        const blob = await res.blob();
        const bytes = new Uint8Array(await blob.arrayBuffer());
        const start = findMotionVideoStart(bytes);
        if (start === -1) {
          // 带 #live 却没扫到内嵌 MP4：整包就是静态图，不必再造一份等价 blob
          // （最坏几十 MB，只是把 HTTP 缓存命中换成内存命中）。记一笔免得反复重提
          if (epoch === cacheEpoch) videoUrlCache.set(imgUrl, null);
          return { videoUrl: null, imageUrl: null };
        }

        const videoUrl = URL.createObjectURL(blob.slice(start, blob.size, "video/mp4"));
        // 静态图 = MP4 起点之前那一段（JPEG）。要求 EOI 紧贴在 MP4 起点之前：实测线上样本
        // 全部是「间隔 0」，一旦放宽成扫描窗口，就可能把 JPEG 数据里凑出来的 ftyp 当真、
        // 切出半张图并缓存进 Map，之后被所有消费者当静态图用且无从察觉
        const imageUrl = bytes[start - 2] === 0xFF && bytes[start - 1] === 0xD9
          ? URL.createObjectURL(blob.slice(0, start, blob.type || "image/jpeg"))
          : null;

        if (epoch !== cacheEpoch) {
          // 期间清过缓存：这份结果已经没人要了，就地 revoke，别再写回 Map
          URL.revokeObjectURL(videoUrl);
          if (imageUrl) URL.revokeObjectURL(imageUrl);
          return { videoUrl: null, imageUrl: null };
        }

        videoUrlCache.set(imgUrl, videoUrl);
        if (imageUrl) imageUrlCache.set(imgUrl, imageUrl);

        return { videoUrl, imageUrl };
      } catch (e) {
        console.error("[useLivePhoto] 提取实况媒体失败:", e);
        return { videoUrl: null, imageUrl: null };
      } finally {
        // 只在代际未变时删：清理后可能已有新一次提取登记了同名条目，误删会让它变成重复 fetch
        if (epoch === cacheEpoch) inflight.delete(imgUrl);
      }
    })();

    inflight.set(imgUrl, promise);
    return promise;
  };

  /**
   * 同步看一眼静态图缓存，命中就返回 Blob URL。
   * 给调用方在「换源那一刻」取值用：取到就用本地 blob（不发请求、也不会有下载空窗），
   * 取不到就退回原 URL——文章页里图片与提取是并发的，硬等 blob 反而让首屏更慢。
   */
  const peekLivePhotoImageUrl = (imgUrl: string): string | null => imageUrlCache.get(imgUrl) ?? null;

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
    peekLivePhotoImageUrl,
    isLivePhoto,
    cleanLivePhotoUrl,
  };
};

export { clearLivePhotoMediaCache };
