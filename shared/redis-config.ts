/**
 * Redis 配置读取（nuxt.config.ts 与 server/utils/redis.ts 共用）
 *
 * 判环境统一为 NODE_ENV：开发用 REDIS_*_DEV 系列，生产用 REDIS_*_PROD 系列。
 * 纯 env 读取、无外部依赖，避免把 ioredis 拉进 Nuxt 构建流程。
 */

export interface RedisConfig {
  host: string;
  port: number;
  password: string | undefined;
  db: number;
  lazyConnect: boolean;
}

export function getRedisConfig(): RedisConfig | null {
  const isDev = process.env.NODE_ENV !== "production";
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
