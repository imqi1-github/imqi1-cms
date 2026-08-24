import Redis from "ioredis";

import type { RedisConfig } from "#shared/redis-config";

// 搜索缓存用的 Redis 连接。
// 配置在构建期烘焙进 runtimeConfig（nuxt.config.ts 从 REDIS_*_DEV/_PROD 解析，
// 见 shared/redis-config.ts），生产运行时不再读取任何 Redis 环境变量；
// 未配置时 runtimeConfig.redis 已被 nuxt.config 兜成 host 为空的零对象，
// 这里以 redisConfig.host 为空判定为关闭，搜索缓存自动关闭（ISR 缓存由
// nitro storage/routeRules 决定，未配置时同样降级到文件系统）。
const redisConfig = useRuntimeConfig().redis as RedisConfig | null | undefined;

export const redis = redisConfig?.host
  ? new Redis({
      ...redisConfig,
      retryStrategy: (times) => {
        return Math.min(times * 50, 2000);
      },
      maxRetriesPerRequest: 3,
    })
  : null;

// Redis 连接事件监听
if (redis && redisConfig) {
  redis.on("connect", () => {
    console.log("[Redis] 连接成功");
  });

  redis.on("ready", () => {
    console.log("[Redis] 服务就绪，可以缓存搜索功能");
    console.log(`[Redis] 配置信息: host=${redisConfig.host}, port=${redisConfig.port}, db=${redisConfig.db}`);
  });

  redis.on("error", (error) => {
    console.error(error);
  });

  redis.on("close", () => {
    console.log("[Redis] 连接已关闭");
  });

  redis.on("reconnecting", () => {
    console.log("[Redis] 正在重连...");
  });

  // 启动时输出连接状态
  console.log(`[Redis] 正在连接到 ${redisConfig.host}:${redisConfig.port}, db=${redisConfig.db}`);
  console.log(`[Redis] 当前状态: ${redis.status}`);
} else {
  console.log("[Redis] 未配置 Redis 连接，将使用本地缓存或无缓存模式");
}
