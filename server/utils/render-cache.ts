/**
 * 文章渲染结果进程内缓存：Shiki 逐代码块高亮是详情接口最贵的单请求工作，
 * 每次 SSR 导航都重算不值。key = `${cid}:${update_time.getTime()}` ——
 * 任何写操作（编辑/自动保存）都会推进 update_time，旧 key 自然失效，无需主动清。
 *
 * 单实例进程内 LRU 即可：渲染 HTML 体积大，进 Redis 序列化得不偿失；容量小
 * （热点文章集），重启冷启动一次可接受。多实例部署时各缓存一份，不影响正确性。
 */

const CAP = 30;
const store = new Map<string, string>();

export function getCachedRender(key: string): string | null {
  const hit = store.get(key);
  if (hit === undefined) return null;
  // LRU 触碰：删了重插，让最近使用的排到末尾
  store.delete(key);
  store.set(key, hit);
  return hit;
}

export function setCachedRender(key: string, html: string): void {
  if (store.has(key)) store.delete(key);
  store.set(key, html);
  while (store.size > CAP) {
    const oldest = store.keys().next().value;
    if (oldest === undefined) break;
    store.delete(oldest);
  }
}
