/**
 * consumeRateLimit 内存兜底分支(redis 未配置,noredis 生产路径):
 * 窗口语义 + 容量上限(回归:memoryStore 只覆写不清理,换 IP 刷接口曾可无限堆积)。
 * 与 rate-limit.test.ts 分开两个文件:mock.module 注册的 redis 值(对象 vs null)互斥。
 */
import "#test/helpers/nitro-globals";

import { describe, expect, mock, test } from "bun:test";

mock.module("#server/utils/redis", () => ({ redis: null }));

const { consumeRateLimit } = await import("#server/utils/rate-limit");

const MAX_MEMORY_ENTRIES = 10_000; // 与实现内 MAX_MEMORY_ENTRIES 一致(未导出,此处字面量锚定)

describe("consumeRateLimit:内存兜底分支", () => {
  test("窗口内计数超限拒绝,窗口过后重置", async () => {
    const first = await consumeRateLimit({ key: "m:win", limit: 1, windowSec: 1 });
    expect(first).toMatchObject({ allowed: true, count: 1 });
    const second = await consumeRateLimit({ key: "m:win", limit: 1, windowSec: 1 });
    expect(second.allowed).toBe(false);
    expect(second.retryAfterMs).toBeGreaterThan(0);
    // 等 1.1s 窗口过期 → 重新计数
    await new Promise(r => setTimeout(r, 1100));
    const third = await consumeRateLimit({ key: "m:win", limit: 1, windowSec: 1 });
    expect(third).toMatchObject({ allowed: true, count: 1 });
  }, 5_000);

  test("回归:唯一 IP 无限堆积被容量上限封顶,最旧条目被逐出", async () => {
    // 灌满容量:每键只请求一次(独立 IP),全部活跃(窗口 3600s 清不掉)
    for (let i = 0; i < MAX_MEMORY_ENTRIES; i++) {
      await consumeRateLimit({ key: `m:cap:${i}`, limit: 1, windowSec: 3600 });
    }
    // 第 0 号键已在 map 里:再请求应计数到 2 被拒(尚未被逐出)
    const before = await consumeRateLimit({ key: "m:cap:0", limit: 1, windowSec: 3600 });
    expect(before.allowed).toBe(false);
    // 新键触发清扫:无过期可清 → 按插入序逐出最旧(m:cap:0)
    const fresh = await consumeRateLimit({ key: "m:cap:new", limit: 1, windowSec: 3600 });
    expect(fresh.allowed).toBe(true);
    // 被逐出的 0 号键重新请求:从 1 重新计数(证明已被清掉,而非永久占位)
    const evicted = await consumeRateLimit({ key: "m:cap:0", limit: 1, windowSec: 3600 });
    expect(evicted).toMatchObject({ allowed: true, count: 1 });
  });
});
