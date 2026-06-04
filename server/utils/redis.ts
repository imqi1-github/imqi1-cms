import Redis from "ioredis";

// 获取 Redis 配置
function getRedisConfig() {
  const isDev = import.meta.env?.DEV ?? process.env.NODE_ENV !== "production";
  const host = isDev ? process.env.REDIS_HOST_DEV : process.env.REDIS_HOST_PROD;

  if (!host) {
    return null;
  }

  const portKey = isDev ? "REDIS_PORT_DEV" : "REDIS_PORT_PROD";
  const passwordKey = isDev ? "REDIS_PASSWORD_DEV" : "REDIS_PASSWORD_PROD";
  const dbKey = isDev ? "REDIS_DB_DEV" : "REDIS_DB_PROD";

  return {
    host,
    port: Number(process.env[portKey]) || 6379,
    password: process.env[passwordKey] || undefined,
    db: Number(process.env[dbKey]) || 0,
    lazyConnect: false,
  };
}

// 创建 Redis 实例
const redisConfig = getRedisConfig();
export const redis = redisConfig
  ? new Redis({
      ...redisConfig,
      retryStrategy: (times) => {
        const delay = Math.min(times * 50, 2000);
        return delay;
      },
      maxRetriesPerRequest: 3,
    })
  : null;

// Redis 连接事件监听
if (redis) {
  redis.on("connect", () => {
    console.log("[Redis] 连接成功");
  });

  redis.on("error", (error) => {
    console.error("[Redis] 连接错误:", error);
  });

  redis.on("close", () => {
    console.log("[Redis] 连接已关闭");
  });

  redis.on("reconnecting", () => {
    console.log("[Redis] 正在重连...");
  });
}

// 导出 Redis 检查函数
export function isRedisAvailable(): boolean {
  return redis !== null && redis.status === "ready";
}

// 优雅关闭
export async function closeRedis() {
  if (redis) {
    await redis.quit();
    console.log("[Redis] 连接已优雅关闭");
  }
}

export default redis;
