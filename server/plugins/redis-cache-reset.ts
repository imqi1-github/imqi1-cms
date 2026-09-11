import { redis } from "#server/utils/redis";

/**
 * 服务启动（进程重启）时清空 Redis 缓存，避免上一次运行 / 旧构建残留的缓存键
 * （整数页 ISR 的 `nitro:*` 页面键、`search:*`、`custom:footprint` 等）在新进程里被命中，
 * 读到陈旧内容或指向旧构建产物。
 *
 * 用 flushdb（清当前 DB）而非 flushall：本仓库 Redis 只作缓存用（页面 ISR + 搜索 + 足迹 +
 * 验证码 + 登录限流），会话存在 file/database（见 session-store.ts 的 SessionStoreType，
 * 不含 redis），故清空不会踢掉登录态。与后台「清空全部缓存 action=all」的 flushdb 同口径。
 *
 * 未配置 Redis 时 redis 为 null，直接跳过（dev 未配 REDIS_HOST_DEV 即如此）。
 * 注意：单实例部署每进程启动清一次即可；若日后多实例横向扩展，此举会互相清掉对方刚建好的
 * 缓存，那种部署下应改为「只清特定前缀」或由部署脚本在停机时清。
 */
export default defineNitroPlugin(async () => {
  if (!redis) return;
  try {
    await redis.flushdb();
    console.log("[cache] 服务启动：已清空 Redis 缓存（避免旧残留）");
  } catch (err) {
    // 启动期 Redis 抖动不应阻断服务：只记一笔，缓存留待后台手动清或下次启动再清
    console.error("[cache] 服务启动清空 Redis 失败（已跳过，不影响启动）:", err);
  }
});
