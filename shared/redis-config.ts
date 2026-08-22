/**
 * Redis 配置读取（仅构建期使用）
 *
 * 由 nuxt.config.ts 在打包时调用，按 NODE_ENV 从环境变量解析 Redis 配置
 * （开发 REDIS_*_DEV 系列，生产 REDIS_*_PROD 系列），并烘焙进两处：
 *   1. Nitro storage / routeRules  → ISR 增量缓存
 *   2. runtimeConfig.redis         → 服务器运行时搜索缓存（server/utils/redis.ts 读取）
 * 生产服务器运行环境不要再设置任何 Redis 环境变量（REDIS_*_PROD / NUXT_REDIS_*），
 * 改 prod 配置后需重新打包才生效。未配置时（host 为空）返回 null：ISR 退回文件系统缓存、
 * 搜索缓存关闭，均不报错。
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
