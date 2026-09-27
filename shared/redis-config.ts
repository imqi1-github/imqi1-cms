/**
 * Redis 配置读取（仅构建期使用）
 *
 * 由 nuxt.config.ts 在打包时调用，解析 Redis 配置并烘焙进两处：
 *   1. Nitro storage / routeRules  → ISR 增量缓存
 *   2. runtimeConfig.redis         → 服务器运行时搜索缓存（server/utils/redis.ts 读取）
 *
 * 取值优先级：构建期环境变量 > `site.config.ts` 的 `build.redis`。
 * - 默认值写在 `site.config.ts`，是裸机部署的唯一改动点。
 * - Docker 部署用不着改配置文件：选哪套 compose 即决定是否启用（见 docker/），
 *   具体参数（host 等）在构建命令里用 `--build-arg REDIS_HOST=...` 覆盖，
 *   由 Dockerfile 的 ENV 落到这里的 process.env。
 *
 * 只在生产构建生效：开发环境恒返回 null（不启用 Redis）。
 * 生产服务器不必再设置 Redis 环境变量，改配置后需重新打包才生效。
 * 未启用时（enabled 为 false 或 host 为空）返回 null：页面整页缓存关闭（实时 SSR）。
 * 注意没有「退回文件系统缓存」的降级——node-server 预设不消费 routeRules 的 isr 键，
 * Nitro 只按 cache 对象包装缓存，未配置时写规则等于没写（详见 nuxt.config.ts）；
 * 搜索缓存同时关闭，均不报错。
 * 纯值读取、无外部依赖，避免把 ioredis 拉进 Nuxt 构建流程。
 */

// 必须相对:本文件由 nuxt.config.ts 经 jiti 加载,别名在那条路径上不解析
import { siteConfig } from "../site.config";

export interface RedisConfig {
  host: string;
  port: number;
  db: number;
  lazyConnect: boolean;
}

/** 读取非空字符串环境变量；未设置或空串视为「未覆盖」（Dockerfile 里空默认值即等于不覆盖） */
function envStr(name: string): string | undefined {
  const value = process.env[name];
  return value ? value : undefined;
}

/** 读取数值环境变量；未设置、空串或非法值视为「未覆盖」（Number("") 为 0，须显式排除） */
function envNum(name: string): number | undefined {
  const raw = process.env[name];
  if (!raw) return undefined;
  const value = Number(raw);
  return Number.isFinite(value) ? value : undefined;
}

/** 解析布尔开关；"false" / "0" / "no"（忽略大小写）为关，其余非空值为开 */
function envBool(name: string): boolean | undefined {
  const raw = envStr(name)?.toLowerCase();
  if (raw === undefined) return undefined;
  return !["false", "0", "no"].includes(raw);
}

export function getRedisConfig(): RedisConfig | null {
  // 开发环境始终不启用 Redis：ISR 走普通 SSR、搜索缓存关闭
  if (process.env.NODE_ENV !== "production") {
    return null;
  }

  const base = siteConfig.build.redis;
  const enabled = envBool("REDIS_ENABLED") ?? base.enabled;
  const host = envStr("REDIS_HOST") ?? base.host;
  const port = envNum("REDIS_PORT") ?? base.port;
  const db = envNum("REDIS_DB") ?? base.db;

  if (!enabled || !host) {
    return null;
  }

  return {
    host,
    port: port || 6379,
    db: db || 0,
    lazyConnect: false,
  };
}
