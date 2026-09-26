// 构建期 Redis 配置解析:优先级 env > site.config.build.redis;开发环境恒 null。
// NODE_ENV/REDIS_* 是进程级,用完即恢复(与 csp.test 同一约定)。
import { afterAll, describe, expect, test } from "bun:test";

import { getRedisConfig } from "#shared/redis-config";
import { siteConfig } from "~~/site.config";

const ORIGINAL_ENV = process.env.NODE_ENV;
const ORIGINAL_REDIS: Record<string, string | undefined> = {
  REDIS_ENABLED: process.env.REDIS_ENABLED,
  REDIS_HOST: process.env.REDIS_HOST,
  REDIS_PORT: process.env.REDIS_PORT,
  REDIS_DB: process.env.REDIS_DB,
};

const REDIS_KEYS = ["REDIS_ENABLED", "REDIS_HOST", "REDIS_PORT", "REDIS_DB"];

// 空串即「未覆盖」(getRedisConfig 的 envStr/envNum 都把空串当缺省),避免动态 delete
function clearRedisEnv(): void {
  for (const k of REDIS_KEYS) process.env[k] = "";
}

afterAll(() => {
  process.env.NODE_ENV = ORIGINAL_ENV;
  for (const [k, v] of Object.entries(ORIGINAL_REDIS)) {
    process.env[k] = v ?? "";
  }
});

function useProductionRedis(env: Record<string, string | undefined>): void {
  process.env.NODE_ENV = "production";
  clearRedisEnv();
  for (const [k, v] of Object.entries(env)) {
    if (v !== undefined) process.env[k] = v;
  }
}

describe("getRedisConfig(构建期解析)", () => {
  test("开发环境恒 null(无视任何 env)", () => {
    process.env.NODE_ENV = "development";
    process.env.REDIS_ENABLED = "true";
    process.env.REDIS_HOST = "redis";
    expect(getRedisConfig()).toBeNull();
  });

  test("显式关闭(enabled=false/0/no)→ null,优先于 site.config", () => {
    for (const off of ["false", "0", "no", "FALSE"]) {
      useProductionRedis({ REDIS_ENABLED: off });
      expect(getRedisConfig()).toBeNull();
    }
  });

  test("默认取 site.config.build.redis(enabled=true + 127.0.0.1)", () => {
    useProductionRedis({});
    expect(siteConfig.build.redis.enabled).toBe(true);
    expect(getRedisConfig()).toEqual({ host: siteConfig.build.redis.host, port: 6379, db: 0, lazyConnect: false });
  });

  test("env 覆盖 host/port/db;空串/非法数值视为未覆盖", () => {
    useProductionRedis({ REDIS_HOST: "redis", REDIS_PORT: "6380", REDIS_DB: "2" });
    expect(getRedisConfig()).toEqual({ host: "redis", port: 6380, db: 2, lazyConnect: false });

    useProductionRedis({ REDIS_PORT: "abc", REDIS_DB: "" });
    expect(getRedisConfig()).toEqual({ host: siteConfig.build.redis.host, port: 6379, db: 0, lazyConnect: false });
  });

  test("port 落 0 时兜底 6379;db 落 0 兜底 0(0 是合法 db)", () => {
    useProductionRedis({ REDIS_PORT: "0" });
    expect(getRedisConfig()!.port).toBe(6379);
    useProductionRedis({ REDIS_PORT: "", REDIS_DB: "0" });
    expect(getRedisConfig()!.db).toBe(0);
  });
});
