import "#test/helpers/nitro-globals";

import { describe, expect, mock, test } from "bun:test";

// 源站缓存层用假件：计数 flushdb / clear 调用，不真连
let flushCalls = 0;
let clearCalls = 0;
let flushImpl: () => Promise<void> = async () => {
  flushCalls++;
};
const clearImpl: () => Promise<void> = async () => {
  clearCalls++;
};

const fakeRedis = {
  flushdb: () => flushImpl(),
};
mock.module("#server/utils/redis", () => ({ redis: fakeRedis }));

const g = globalThis as unknown as Record<string, unknown>;
g.useStorage = () => ({ clear: () => clearImpl(), getItem: async () => null, setItem: async () => undefined });
// 构建哈希固定；CDN 未启用（createCdnProvider 返回 null）→ 不触达边缘刷新
g.useRuntimeConfig = () => ({ buildHash: "test-build", redis: null });

const plugin = (await import("#server/plugins/cache-reset")).default as () => Promise<void>;

/** 等一拍：插件的清理是 fire-and-forget（不阻塞启动） */
const tick = () => new Promise(resolve => setTimeout(resolve, 20));

describe("cache-reset 插件", () => {
  test("配了 Redis → 启动即 flushdb（清旧构建残留缓存，与原行为一致）", async () => {
    flushCalls = 0;
    plugin();
    await tick();
    expect(flushCalls).toBe(1);
    expect(clearCalls).toBe(0);
  });

  test("未配 Redis → 改清文件缓存挂载（驱动无关）", async () => {
    mock.module("#server/utils/redis", () => ({ redis: null }));
    flushCalls = 0;
    clearCalls = 0;
    plugin();
    await tick();
    expect(clearCalls).toBe(1);
    expect(flushCalls).toBe(0);
    mock.module("#server/utils/redis", () => ({ redis: fakeRedis }));
  });

  test("清缓存抛错不阻断启动（启动期抖动只记一笔）", async () => {
    flushImpl = async () => {
      throw new Error("redis down");
    };
    await expect((async () => {
      plugin();
      await tick();
    })()).resolves.toBeUndefined();
    flushImpl = async () => {
      flushCalls++;
    };
  });
});

describe("shouldResetEdgeCache（构建变了才刷边缘）", () => {
  test("首次启动（无标记）→ 要刷", async () => {
    const { shouldResetEdgeCache } = await import("#server/utils/cdn");
    expect(shouldResetEdgeCache(null, "b1")).toBe(true);
  });

  test("同一构建重启 → 不刷（避免每次重启都耗额度）", async () => {
    const { shouldResetEdgeCache } = await import("#server/utils/cdn");
    expect(shouldResetEdgeCache("b1", "b1")).toBe(false);
  });

  test("换了构建 → 要刷（旧 HTML 引用的静态资源可能已被清理）", async () => {
    const { shouldResetEdgeCache } = await import("#server/utils/cdn");
    expect(shouldResetEdgeCache("b1", "b2")).toBe(true);
  });

  test("没有构建哈希（开发环境）→ 不刷", async () => {
    const { shouldResetEdgeCache } = await import("#server/utils/cdn");
    expect(shouldResetEdgeCache(null, "")).toBe(false);
  });
});
