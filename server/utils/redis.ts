import Redis from "ioredis";

import { getRedisConfig } from "#shared/redis-config";

// 创建 Redis 实例
const redisConfig = getRedisConfig();
export const redis = redisConfig
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
