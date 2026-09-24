import "#test/helpers/nitro-globals";

import { describe, expect, mock, test } from "bun:test";

// redis 用假件:计数 flushdb 调用,不真连
let flushCalls = 0;
let flushImpl: () => Promise<void> = async () => {
  flushCalls++;
};
const fakeRedis = {
  get redis() {
    return {
      flushdb: () => flushImpl(),
    };
  },
};
mock.module("#server/utils/redis", () => ({ redis: fakeRedis.redis }));

const plugin = (await import("#server/plugins/redis-cache-reset")).default as () => Promise<void>;

describe("redis-cache-reset 插件", () => {
  test("redis 可用时启动即 flushdb(清旧构建残留缓存)", async () => {
    flushCalls = 0;
    await plugin();
    expect(flushCalls).toBe(1);
  });

  test("redis 为 null(未配置)时直接跳过不抛", async () => {
    const original = flushImpl;
    flushImpl = async () => {
      throw new Error("不应被调用");
    };
    mock.module("#server/utils/redis", () => ({ redis: null }));
    await expect(plugin()).resolves.toBeUndefined();
    mock.module("#server/utils/redis", () => ({ redis: fakeRedis.redis }));
    flushImpl = original;
  });

  test("flushdb 抛错不阻断启动(启动期抖动只记一笔)", async () => {
    flushImpl = async () => {
      throw new Error("redis down");
    };
    await expect(plugin()).resolves.toBeUndefined();
  });
});
