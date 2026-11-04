/**
 * 进程内 TTL 键值存储
 *
 * Redis 未启用时的兜底后端：生产可以不装 Redis（页面缓存已交给 CDN 边缘缓存，
 * 这里只承接搜索结果、足迹聚合、计数去重这类短期数据）。
 * 单实例适用，重启清零；容量上限防无界增长。
 */

/** 容量上限：超限时先扫过期项，仍满则按插入序淘汰最旧 */
const MAX_ENTRIES = 10_000;

interface MemoryEntry {
  value: string;
  /** 过期时刻（毫秒时间戳）；0 表示无 TTL */
  expiresAt: number;
}

const store = new Map<string, MemoryEntry>();

function isExpired(entry: MemoryEntry, now: number): boolean {
  return entry.expiresAt > 0 && entry.expiresAt <= now;
}

/** 读取并顺手清理过期项 */
export async function memoryGet(key: string): Promise<string | null> {
  const entry = store.get(key);
  if (!entry) return null;
  if (isExpired(entry, Date.now())) {
    store.delete(key);
    return null;
  }
  return entry.value;
}

/** 写入并设 TTL（秒）；ttl<=0 视为立即过期 */
export async function memorySetex(key: string, ttlSec: number, value: string): Promise<void> {
  if (ttlSec <= 0) {
    store.delete(key);
    return;
  }
  if (store.size >= MAX_ENTRIES) sweep();
  // 删后重插：让 Map 迭代序≈最近使用序，淘汰时先淘汰冷数据
  store.delete(key);
  store.set(key, { value, expiresAt: Date.now() + ttlSec * 1000 });
}

/** 删除 */
export async function memoryDel(key: string): Promise<void> {
  store.delete(key);
}

/** 自增：键不存在（或已过期）时置 1 并返回 1 */
export async function memoryIncr(key: string): Promise<number> {
  const current = await memoryGet(key);
  const next = (current === null ? 0 : Number.parseInt(current, 10) || 0) + 1;
  const entry = store.get(key);
  const expiresAt = entry && !isExpired(entry, Date.now()) ? entry.expiresAt : 0;
  store.delete(key);
  store.set(key, { value: String(next), expiresAt });
  return next;
}

/** 设 TTL：键不存在返回 0 */
export async function memoryExpire(key: string, ttlSec: number): Promise<number> {
  const entry = store.get(key);
  if (!entry || isExpired(entry, Date.now())) {
    store.delete(key);
    return 0;
  }
  entry.expiresAt = Date.now() + ttlSec * 1000;
  return 1;
}

/** 剩余 TTL（秒）：-1 = 无 TTL，-2 = 键不存在（与 Redis 语义一致） */
export async function memoryTtl(key: string): Promise<number> {
  const entry = store.get(key);
  if (!entry || isExpired(entry, Date.now())) {
    if (entry) store.delete(key);
    return -2;
  }
  if (entry.expiresAt === 0) return -1;
  return Math.ceil((entry.expiresAt - Date.now()) / 1000);
}

/** 清空（进程重启/测试重置用） */
export async function memoryClear(): Promise<void> {
  store.clear();
}

/** 容量超限时清扫：先删过期项，仍超限则按插入序丢最旧 */
function sweep(): void {
  const now = Date.now();
  for (const [key, entry] of store) {
    if (isExpired(entry, now)) store.delete(key);
  }
  while (store.size >= MAX_ENTRIES) {
    const oldest = store.keys().next().value;
    if (oldest === undefined) break;
    store.delete(oldest);
  }
}
