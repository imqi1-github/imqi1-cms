// 刷新额度熔断按天复位：额度用尽当天不再自动刷新，跨天要恢复。
import "#test/helpers/nitro-globals";

import { afterEach, describe, expect, setSystemTime, test } from "bun:test";

import { isCdnQuotaExhausted, runCdnPurge } from "#server/utils/cdn";
import type { CdnProvider, CdnPurgeResult } from "#server/types/utils/cdn";

const fakeProvider = (result: CdnPurgeResult): CdnProvider => ({
  name: "fake",
  isEnabled: () => true,
  purgeUrls: async () => result,
  purgeRoutes: async () => result,
});

afterEach(() => {
  setSystemTime();
});

describe("CDN 刷新额度熔断", () => {
  test("额度用尽 → 当天不再自动刷新", async () => {
    expect(isCdnQuotaExhausted()).toBe(false);
    await runCdnPurge(
      fakeProvider({ provider: "fake", success: false, requested: 1, error: "LimitExceeded.DailyQuota 已达上限" }),
      async () => ({ provider: "fake", success: false, requested: 1, error: "LimitExceeded.DailyQuota 已达上限" }),
      { 来源: "测试" },
    );
    expect(isCdnQuotaExhausted()).toBe(true);
  });

  test("跨天自动复位（额度是按天计的）", async () => {
    expect(isCdnQuotaExhausted()).toBe(true);
    const tomorrow = new Date(Date.now() + 24 * 60 * 60 * 1000);
    setSystemTime(tomorrow);
    expect(isCdnQuotaExhausted()).toBe(false);
  });
});
