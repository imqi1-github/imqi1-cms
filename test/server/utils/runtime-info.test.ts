import "#test/helpers/nitro-globals";

import { describe, expect, test } from "bun:test";

// getBuildHash 依赖 Nitro 自动导入的 useRuntimeConfig,nitro-globals 未含它,此处给桩
const g = globalThis as unknown as Record<string, unknown>;
g.useRuntimeConfig = (() => ({ buildHash: "unit-test-hash" }));

const { getBuildHash, detectDocker } = await import("#server/utils/runtime-info");

describe("runtime-info", () => {
  test("getBuildHash 从 runtimeConfig 读取", () => {
    expect(getBuildHash()).toBe("unit-test-hash");
  });

  test("detectDocker:Windows 开发机上稳定返回 false(两处探测均不可达,兜底不抛)", async () => {
    if (process.platform === "win32") {
      expect(await detectDocker()).toBe(false);
    } else {
      // 非 Windows 不假设环境,只验证不抛
      expect(typeof await detectDocker()).toBe("boolean");
    }
  });
});
