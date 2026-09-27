/**
 * server/utils/session-store.ts getSessionStore TTL 节流 + 单例 + 类型切换
 *  - 同 storeType 多次调用 → 返同一 globalThis.__imqiSessionStore 引用
 *  - 节流:10 分钟内多次不触发 cleanup,跨过 10 分钟边界才再次触发
 *  - storeType 切换 → 重建新实例
 *  - cleanup 是 fire-and-forget,spy 计数基于调用次数而非完成
 *
 * 注:globalThis.__imqiSessionStore 在每个 beforeEach 重置,保证测试间隔离
 */
import "#test/helpers/nitro-globals";

import { afterEach, beforeEach, describe, expect, spyOn, test } from "bun:test";

import { mockSharedPrisma, sharedFake } from "#test/helpers/fake-prisma";

mockSharedPrisma();

const G = globalThis as Record<string, unknown>;
let setStoreType: (type: string) => void;

beforeEach(() => {
  // 重置全局 session store 单例
  delete G.__imqiSessionStore;
  delete G.__imqiSessionStoreType;
  // mock informations.findUnique 返指定 storeType
  setStoreType = (type: string) => {
    sharedFake.on("informations", "findUnique", async ({ where }: { where: { key: string } }) => {
      if (where.key === "sessionStoreType") return { value: type };
      return null;
    });
  };
  setStoreType("memory");
});

afterEach(() => {
  delete G.__imqiSessionStore;
  delete G.__imqiSessionStoreType;
});

const { getSessionStore, MemorySessionStore, FileSessionStore, DatabaseSessionStore } = await import(
  "#server/utils/session-store"
);

describe("getSessionStore 单例 + 类型切换", () => {
  test("首次调用(memory)→ 创建 MemorySessionStore,挂到 globalThis", async () => {
    const store = await getSessionStore();
    expect(store).toBeInstanceOf(MemorySessionStore);
    expect(G.__imqiSessionStore).toBe(store);
    expect(G.__imqiSessionStoreType).toBe("memory");
  });

  test("同 storeType 多次调用 → 返同一引用(全局单例)", async () => {
    const s1 = await getSessionStore();
    const s2 = await getSessionStore();
    const s3 = await getSessionStore();
    expect(s1).toBe(s2);
    expect(s2).toBe(s3);
  });

  test("storeType 切换 memory → file → 新 FileSessionStore 实例", async () => {
    const memoryStore = await getSessionStore();
    expect(memoryStore).toBeInstanceOf(MemorySessionStore);

    setStoreType("file");
    const fileStore = await getSessionStore();
    expect(fileStore).toBeInstanceOf(FileSessionStore);
    expect(fileStore).not.toBe(memoryStore);
    expect(G.__imqiSessionStoreType).toBe("file");
  });

  test("storeType 切换 memory → database → 新 DatabaseSessionStore 实例", async () => {
    setStoreType("memory");
    await getSessionStore();
    setStoreType("database");
    const dbStore = await getSessionStore();
    expect(dbStore).toBeInstanceOf(DatabaseSessionStore);
    expect(G.__imqiSessionStoreType).toBe("database");
  });

  test("storeType 未设置 → 默认 'file'(informations.findUnique 返 null)", async () => {
    sharedFake.on("informations", "findUnique", async () => null);
    const store = await getSessionStore();
    expect(store).toBeInstanceOf(FileSessionStore);
  });
});

describe("getSessionStore TTL 节流", () => {
  test("首次创建 store → cleanup 被调一次(不受节流限制)", async () => {
    const store = await getSessionStore();
    const spy = spyOn(store, "cleanup");
    // 调一次以验证 spy 工作(首次创建已 fire-and-forget,但 spy 装在已创建实例后)
    store.cleanup();
    expect(spy).toHaveBeenCalledTimes(1);
  });

  test("同 storeType 重复调用 < 10 分钟 → maybeCleanupStore 节流命中,cleanup 不再触发", async () => {
    const store = await getSessionStore();
    const spy = spyOn(store, "cleanup");
    // 已 spy 实例方法;后续 getSessionStore 内 maybeCleanupStore 调 store.cleanup 会被 spy 捕获
    await getSessionStore();
    await getSessionStore();
    await getSessionStore();
    // 首次创建已 fire-and-forget 一次(spy 装在实例上后,不会捕获之前的调用)
    // 三次同 storeType 调用,但 < 10 分钟 → 节流命中 → 不触发
    expect(spy).toHaveBeenCalledTimes(0);
  });

  test("节流跨 10 分钟边界 → cleanup 再次触发", async () => {
    const realDateNow = Date.now;
    const realNow = Date.now();
    // baseTime 取当前真实时间 + 1s,确保 > 模块内 lastCleanupAt(初始创建时记录)
    const baseTime = realNow + 1000;
    Date.now = () => baseTime;
    try {
      const store = await getSessionStore();
      const spy = spyOn(store, "cleanup");
      // 首次创建已 fire-and-forget 一次(spy 装在实例后未捕获)
      // +11 分钟跨过 10 分钟边界
      Date.now = () => baseTime + 11 * 60 * 1000;
      await getSessionStore();
      expect(spy).toHaveBeenCalledTimes(1);
      // +1 分钟(从上次 cleanup 起 < 10 分钟)→ 节流命中
      Date.now = () => baseTime + 12 * 60 * 1000;
      await getSessionStore();
      expect(spy).toHaveBeenCalledTimes(1);
    } finally {
      Date.now = realDateNow;
    }
  });
});