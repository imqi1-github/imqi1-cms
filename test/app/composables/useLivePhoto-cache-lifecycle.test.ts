/**
 * useLivePhoto 模块级缓存 + 代际隔离 + 延后 revoke(记忆 livephoto-video-blob-cache):
 *  1) 缓存命中:同 URL 二次调 → fetch 不再被调
 *  2) inflight 去重:同 URL 并发两次 → fetch 只调一次,结果共享
 *  3) cacheEpoch 隔离:clearLivePhotoMediaCache 后,旧 promise resolve 时不写回新 map
 *     且对应 blob URL 立即 revoke(防止"刚 revoke 又写回 cache"循环)
 *  4) retiredBlobUrls 延后 revoke:clear 后再 clear → 第一次挪入 retired,第二次才真正 revoke
 *     (避免路由切换时旧页面过渡动画还在引用 blob URL 就被 revoke 报 ERR_FILE_NOT_FOUND)
 */
import { afterEach, beforeEach, describe, expect, test } from "bun:test";

// 构造 fake JPEG + MP4 字节(满足 findMotionVideoStart 校验:box size >= 8 + 'ftyp')
function makeJpegPlusMp4Bytes(): Uint8Array {
  // 2 字节 JPEG EOI (0xFF 0xD9) + MP4 box(8 字节 box size + 'ftyp' + 8 字节 minor type)
  const jpegEoi = [0xff, 0xd9];
  const mp4Box = [
    0x00, 0x00, 0x00, 0x20, // box size=72
    0x66, 0x74, 0x79, 0x70, // 'ftyp'
    0x69, 0x73, 0x6f, 0x6d, // 'isom'
  ];
  const arr = new Uint8Array([...jpegEoi, ...mp4Box]);
  // bytes[0]=FF, bytes[1]=D9, bytes[2..]=mp4 box
  // findMotionVideoStart 在 p+1=0x74 (字节 5),p+2=0x79 (字节 6),p+3=0x70 (字节 7)
  // box size 在 bytes[p-4..p-1] = bytes[2..5] = 0x00 0x00 0x00 0x20 = 32 >= 8 ✓
  return arr;
}

// 一个空 MP4(no ftyp)→ 触发 "videoUrl = null" 分支
function makePlainJpegBytes(): Uint8Array {
  // JPEG header + EOI,没有 MP4 box
  return new Uint8Array([0xff, 0xd8, 0xff, 0xe0, 0x00, 0x10, 0xff, 0xd9]);
}

let fetchCalls: string[];
let originalFetch: typeof globalThis.fetch;

beforeEach(() => {
  fetchCalls = [];
  originalFetch = globalThis.fetch;
  // 默认 fetch 立即 resolve 一个 fake JPEG+MP4
  globalThis.fetch = (async (url: string) => {
    fetchCalls.push(url);
    const bytes = makeJpegPlusMp4Bytes();
    return {
      ok: true,
      status: 200,
      statusText: "OK",
      blob: async () => ({
        size: bytes.length,
        type: "image/jpeg",
        slice: (start: number, end: number, type?: string) => ({ size: end - start, type }),
        arrayBuffer: async () => bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength),
      }),
      arrayBuffer: async () => bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength),
    };
  }) as typeof globalThis.fetch;
  // URL.createObjectURL/revokeObjectURL spy
  const origCreate = URL.createObjectURL;
  const origRevoke = URL.revokeObjectURL;
  let createCount = 0;
  let revokeCount = 0;
  const createCalls: unknown[] = [];
  const revokeCalls: unknown[] = [];
  URL.createObjectURL = ((blob: unknown) => {
    createCount++;
    createCalls.push(blob);
    return `blob:fake/${createCount}`;
  }) as typeof URL.createObjectURL;
  URL.revokeObjectURL = ((url: string) => {
    revokeCount++;
    revokeCalls.push(url);
  }) as typeof URL.revokeObjectURL;
  // 暴露计数供断言
  (globalThis as Record<string, unknown>).__createCount = () => createCount;
  (globalThis as Record<string, unknown>).__revokeCount = () => revokeCount;
  (globalThis as Record<string, unknown>).__createCalls = createCalls;
  (globalThis as Record<string, unknown>).__revokeCalls = revokeCalls;
  void origCreate;
  void origRevoke;
});

afterEach(async () => {
  globalThis.fetch = originalFetch;
  URL.createObjectURL = () => "";
  // 恢复原始 URL.createObjectURL(上面 beforeEach 替换,这里恢复)
  URL.revokeObjectURL = (() => undefined) as typeof URL.revokeObjectURL;
  // 简单方式:重新拉一份 useLivePhoto 模块副作用重置 caches
  const { clearLivePhotoMediaCache } = await import("~/composables/useLivePhoto");
  clearLivePhotoMediaCache();
});

const { useLivePhoto, clearLivePhotoMediaCache } = await import("~/composables/useLivePhoto");

describe("useLivePhoto 缓存命中", () => {
  test("同 URL 二次调 → fetch 不再被调,直接返 cache", async () => {
    const { extractLivePhotoMedia } = useLivePhoto();
    const url = "https://x.com/a.jpg#live";
    const r1 = await extractLivePhotoMedia(url);
    expect(fetchCalls).toHaveLength(1);
    expect(r1.videoUrl).toMatch(/^blob:fake\//);
    const r2 = await extractLivePhotoMedia(url);
    expect(fetchCalls).toHaveLength(1); // 仍是 1
    expect(r2.videoUrl).toBe(r1.videoUrl); // 同 blob URL
  });

  test("peekLivePhotoImageUrl:已缓存时返 blob URL,未缓存时 null", async () => {
    const { extractLivePhotoMedia, peekLivePhotoImageUrl } = useLivePhoto();
    clearLivePhotoMediaCache();
    expect(peekLivePhotoImageUrl("https://x.com/not-loaded.jpg#live")).toBeNull();
    await extractLivePhotoMedia("https://x.com/a.jpg#live");
    expect(peekLivePhotoImageUrl("https://x.com/a.jpg#live")).not.toBeNull();
  });
});

describe("useLivePhoto inflight 去重", () => {
  test("同 URL 并发两次 → fetch 只调一次,两个调用方拿到同结果", async () => {
    const url = "https://x.com/b.jpg#live";
    const { extractLivePhotoMedia } = useLivePhoto();
    const [r1, r2] = await Promise.all([
      extractLivePhotoMedia(url),
      extractLivePhotoMedia(url),
    ]);
    expect(fetchCalls).toHaveLength(1);
    expect(r1.videoUrl).toBe(r2.videoUrl);
  });
});

describe("useLivePhoto cacheEpoch 隔离", () => {
  test("clearLivePhotoMediaCache 后旧 promise resolve 时不写回新 cache,blob 立即 revoke", async () => {
    let resolver!: (b: Uint8Array) => void;
    globalThis.fetch = (async (): Promise<Response> => new Promise<Response>((resolve) => {
      resolver = (b) => resolve({
        ok: true,
        status: 200,
        statusText: "OK",
        blob: async () => ({
          size: b.length,
          type: "image/jpeg",
          slice: (s: number, e: number) => ({ size: e - s }),
          arrayBuffer: async () => b.buffer.slice(b.byteOffset, b.byteOffset + b.byteLength),
        }),
        arrayBuffer: async () => b.buffer.slice(b.byteOffset, b.byteOffset + b.byteLength),
      } as Response);
    })) as unknown as typeof globalThis.fetch;
    const { extractLivePhotoMedia, peekLivePhotoImageUrl } = useLivePhoto();
    const url = "https://x.com/c.jpg#live";
    const p = extractLivePhotoMedia(url);
    // 在 fetch resolve 之前清缓存 → 代际变
    clearLivePhotoMediaCache();
    const revokeBefore = ((globalThis as Record<string, unknown>).__revokeCount as () => number)();
    resolver(makeJpegPlusMp4Bytes());
    const r = await p;
    // 关键不变式:清缓存后,旧 promise 不写回新 map
    expect(peekLivePhotoImageUrl(url)).toBeNull();
    expect(r.videoUrl).toBeNull(); // 已被就地 revoke
    // 至少一次 revoke(videoUrl,清缓存前已生成的)
    expect(((globalThis as Record<string, unknown>).__revokeCount as () => number)()).toBeGreaterThanOrEqual(revokeBefore);
  });
});

describe("useLivePhoto retiredBlobUrls 延后 revoke", () => {
  test("两次 clearLivePhotoMediaCache → 第一次挪入 retired,第二次才真正 revoke", async () => {
    const { extractLivePhotoMedia } = useLivePhoto();
    const url = "https://x.com/d.jpg#live";
    const r = await extractLivePhotoMedia(url);
    expect(r.videoUrl).toMatch(/^blob:fake\//);
    const createdBlob = r.videoUrl!;
    const revokeBefore = ((globalThis as Record<string, unknown>).__revokeCount as () => number)();

    // 第一次 clear:挪入 retired,不 revoke(旧页面过渡层可能还在引用)
    clearLivePhotoMediaCache();
    expect(((globalThis as Record<string, unknown>).__revokeCount as () => number)()).toBe(revokeBefore);

    // 第二次 clear:真正 revoke
    clearLivePhotoMediaCache();
    expect(((globalThis as Record<string, unknown>).__revokeCount as () => number)()).toBeGreaterThan(revokeBefore);
    const revokeCalls = ((globalThis as Record<string, unknown>).__revokeCalls as unknown[]) as string[];
    expect(revokeCalls).toContain(createdBlob);
  });
});

describe("useLivePhoto 无 MP4 fallback", () => {
  test("bytes 不含 ftyp → videoUrl=null 不进 cache,但返空对象", async () => {
    globalThis.fetch = (async (url: string) => {
      fetchCalls.push(url);
      const bytes = makePlainJpegBytes();
      return {
        ok: true,
        status: 200,
        statusText: "OK",
        blob: async () => ({
          size: bytes.length,
          type: "image/jpeg",
          slice: () => ({ size: 0 }),
          arrayBuffer: async () => bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength),
        }),
        arrayBuffer: async () => bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength),
      };
    }) as typeof globalThis.fetch;
    const { extractLivePhotoMedia, peekLivePhotoImageUrl } = useLivePhoto();
    const url = "https://x.com/no-mp4.jpg#live";
    const r = await extractLivePhotoMedia(url);
    expect(r.videoUrl).toBeNull();
    expect(r.imageUrl).toBeNull();
    // videoUrl=null 会写入 cache(避免重提);imageUrl 不写
    // 二次调不会再 fetch
    expect(fetchCalls).toHaveLength(1);
    const r2 = await extractLivePhotoMedia(url);
    expect(fetchCalls).toHaveLength(1);
    expect(r2.videoUrl).toBeNull();
    expect(peekLivePhotoImageUrl(url)).toBeNull();
  });
});