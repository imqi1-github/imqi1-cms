// 进程内 TTL 键值存储（Redis 未启用时的兜底后端）。
// TTL 语义与 Redis 对齐：-1 = 无 TTL，-2 = 键不存在。
import { beforeEach, describe, expect, test } from "bun:test";

import {
  memoryClear,
  memoryDel,
  memoryExpire,
  memoryGet,
  memoryIncr,
  memorySetex,
  memoryTtl,
} from "#server/utils/cache/memory-store";

beforeEach(async () => {
  await memoryClear();
});

describe("内存缓存", () => {
  test("写入后能读出", async () => {
    await memorySetex("k", 60, "v");
    expect(await memoryGet("k")).toBe("v");
  });

  test("不存在的键返回 null", async () => {
    expect(await memoryGet("missing")).toBeNull();
  });

  test("TTL：无 TTL 为 -1，不存在为 -2", async () => {
    expect(await memoryTtl("missing")).toBe(-2);
    await memoryIncr("counter");
    expect(await memoryTtl("counter")).toBe(-1);
  });

  test("设 TTL 后返回剩余秒数", async () => {
    await memorySetex("k", 30, "v");
    const ttl = await memoryTtl("k");
    expect(ttl).toBeGreaterThan(0);
    expect(ttl).toBeLessThanOrEqual(30);
  });

  test("过期即读不到", async () => {
    await memorySetex("k", 0, "v");
    expect(await memoryGet("k")).toBeNull();
  });

  test("自增：不存在从 1 起，存在则累加", async () => {
    expect(await memoryIncr("c")).toBe(1);
    expect(await memoryIncr("c")).toBe(2);
    expect(await memoryGet("c")).toBe("2");
  });

  test("自增保留已有 TTL", async () => {
    await memorySetex("c", 30, "1");
    await memoryIncr("c");
    expect(await memoryTtl("c")).toBeGreaterThan(0);
  });

  test("expire：键存在返回 1，不存在返回 0", async () => {
    expect(await memoryExpire("missing", 10)).toBe(0);
    await memorySetex("k", 60, "v");
    expect(await memoryExpire("k", 10)).toBe(1);
    expect(await memoryTtl("k")).toBeLessThanOrEqual(10);
  });

  test("删除后读不到", async () => {
    await memorySetex("k", 60, "v");
    await memoryDel("k");
    expect(await memoryGet("k")).toBeNull();
  });
});
