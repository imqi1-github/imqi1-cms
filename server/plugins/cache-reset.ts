import { redis } from "#server/utils/redis";
import { getBuildHash } from "#server/utils/runtime-info";
import { createCdnProvider, shouldResetEdgeCache } from "#server/utils/cdn";
import { log } from "#server/utils/log";

/**
 * 服务启动时的缓存清理（对齐原「启动即 flushdb」的语义，但分两层对待）
 *
 * 1. **源站缓存：每次启动清空**。进程重启后旧缓存（页面 ISR、接口缓存）可能指向旧构建产物
 *    或已删除的数据，清掉最省心。配了 Redis 就 flushdb（与原实现完全一致），
 *    没配则清文件缓存挂载（`.nitro/cache`，驱动无关）。
 * 2. **CDN 边缘缓存：只在构建变化时刷一次**。每次启动都刷会白烧刷新额度（免费版目录 50/天），
 *    而重启往往一天好几次；但换构建不清的话，旧 HTML 会引用 `static/<旧 buildHash>` 的资源，
 *    资源一旦被清理就会 404。故用 buildHash 做标记：变了才刷，同一构建内重启不刷。
 *
 * 可用 `CDN_PURGE_ON_STARTUP=0` 关掉边缘刷新（额度极紧时）。
 */
export default defineNitroPlugin(() => {
  void resetSourceCache();
  void resetEdgeCache();
});

/** 源站缓存：每次启动清空 */
async function resetSourceCache(): Promise<void> {
  try {
    if (redis) {
      await redis.flushdb();
    } else {
      await useStorage("cache").clear();
    }
    if (process.env.NODE_ENV !== "test") {
      console.log(`[cache] 服务启动：已清空源站缓存（${redis ? "Redis" : "文件缓存"}）`);
    }
  } catch (error) {
    // 启动期缓存层抖动不应阻断服务：留待后台手动清或下次启动再清
    console.error("[cache] 服务启动清空源站缓存失败（已跳过，不影响启动）:", error);
  }
}

/** 边缘缓存：buildHash 变了（= 发了新版）才刷，避免每次重启都消耗刷新额度 */
async function resetEdgeCache(): Promise<void> {
  if ((process.env.CDN_PURGE_ON_STARTUP || "").trim() === "0") return;

  const provider = createCdnProvider();
  if (!provider?.isEnabled()) return;

  try {
    // 标记落在 fs 挂载（.data/storage）：跨重启、跨发版保留
    const marker = useStorage("fs");
    const markerKey = "deploy/edge-cache-build-hash";
    const buildHash = getBuildHash();
    const lastHash = await marker.getItem<string>(markerKey);

    if (!shouldResetEdgeCache(lastHash, buildHash)) return;

    const result = await provider.purgeRoutes([]);
    log.cache("CDN 刷新", {
      provider: provider.name,
      来源: "启动（构建变化）",
      路由: "(全站页面)",
      目标数: result.requested,
      结果: result.success ? "成功" : `失败 ${result.error ?? ""}`,
      任务号: result.taskId,
    });

    // 成功才落标记：失败的话下次启动会重试
    if (result.success) await marker.setItem(markerKey, buildHash);
  } catch (error) {
    log.error("[cache] 服务启动刷新 CDN 边缘缓存失败（已跳过，不影响启动）", { error });
  }
}
