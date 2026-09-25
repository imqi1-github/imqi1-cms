import { describe, expect, test } from "bun:test";

import { resolveTrustedDeviceName } from "#server/utils/trusted-device-name";

describe("resolveTrustedDeviceName", () => {
  test("自定义名优先(去首尾空白,截断 100)", () => {
    expect(resolveTrustedDeviceName("  我的手机  ", "Mozilla/5.0 Chrome/120.0")).toBe("我的手机");
    expect(resolveTrustedDeviceName("长".repeat(120), "")).toBe("长".repeat(100));
  });

  test("无自定义名回落 UA 预解析的浏览器名", () => {
    expect(resolveTrustedDeviceName(null, "Mozilla/5.0 Chrome/120.0")).toBe("Chrome");
    expect(resolveTrustedDeviceName(undefined, "MicroMessenger/8.0")).toBe("微信");
  });

  test("均无法识别返回 null", () => {
    expect(resolveTrustedDeviceName("", "totally-unknown-agent")).toBeNull();
  });
});
