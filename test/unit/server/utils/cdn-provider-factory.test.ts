// CDN provider 工厂：开发环境恒不启用（本地写库不能真刷生产站、白烧额度）。
import { afterEach, describe, expect, test } from "bun:test";

import { createCdnProvider, isCdnDisabledByEnv, isCdnEnabled } from "#server/utils/cdn";

const ENV_KEYS = ["NODE_ENV", "CDN_PROVIDER", "EDGEONE_ZONE_ID", "EDGEONE_SECRET_ID", "EDGEONE_SECRET_KEY"] as const;
const ORIGINAL = Object.fromEntries(ENV_KEYS.map(k => [k, process.env[k]])) as Record<string, string | undefined>;

afterEach(() => {
  for (const k of ENV_KEYS) {
    const v = ORIGINAL[k];
    if (v === undefined) Reflect.deleteProperty(process.env, k);
    else process.env[k] = v;
  }
});

function withFullConfig(): void {
  process.env.CDN_PROVIDER = "edgeone";
  process.env.EDGEONE_ZONE_ID = "zone-test";
  process.env.EDGEONE_SECRET_ID = "AKIDtest";
  process.env.EDGEONE_SECRET_KEY = "key";
}

describe("CDN provider 工厂", () => {
  test("开发环境：即使配齐 ZoneId 与密钥也不启用", () => {
    withFullConfig();
    process.env.NODE_ENV = "development";
    expect(isCdnDisabledByEnv()).toBe(true);
    expect(createCdnProvider()).toBeNull();
    expect(isCdnEnabled()).toBe(false);
  });

  test("非开发环境：配齐即启用", () => {
    withFullConfig();
    process.env.NODE_ENV = "production";
    expect(isCdnDisabledByEnv()).toBe(false);
    expect(createCdnProvider()?.isEnabled()).toBe(true);
  });

  test("非开发环境：没配 ZoneId/密钥则不启用", () => {
    process.env.NODE_ENV = "production";
    process.env.CDN_PROVIDER = "none";
    process.env.EDGEONE_ZONE_ID = "";
    process.env.EDGEONE_SECRET_ID = "";
    process.env.EDGEONE_SECRET_KEY = "";
    expect(createCdnProvider()).toBeNull();
  });
});
