import "#test/helpers/nitro-globals";

import { afterAll, describe, expect, test } from "bun:test";

const plugin = (await import("#server/plugins/ssr-internal-secret")).default as () => void;

const ORIGINAL_SECRET = process.env.SSR_INTERNAL_REQUEST_SECRET;

afterAll(() => {
  if (ORIGINAL_SECRET === undefined) delete process.env.SSR_INTERNAL_REQUEST_SECRET;
  else process.env.SSR_INTERNAL_REQUEST_SECRET = ORIGINAL_SECRET;
});

describe("ssr-internal-secret 插件", () => {
  test("已显式配置时不覆盖", () => {
    process.env.SSR_INTERNAL_REQUEST_SECRET = "my-fixed-secret";
    plugin();
    expect(process.env.SSR_INTERNAL_REQUEST_SECRET).toBe("my-fixed-secret");
  });

  test("未配置时生成 64 位 hex 随机密钥(fail-closed,不回落公开常量)", () => {
    delete process.env.SSR_INTERNAL_REQUEST_SECRET;
    plugin();
    const generated = process.env.SSR_INTERNAL_REQUEST_SECRET!;
    expect(generated).toMatch(/^[0-9a-f]{64}$/);
    // 再跑一次(删除后)生成新值:随进程随机,而非固定常量
    delete process.env.SSR_INTERNAL_REQUEST_SECRET;
    plugin();
    expect(process.env.SSR_INTERNAL_REQUEST_SECRET).not.toBe(generated);
  });
});
