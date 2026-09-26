import { describe, expect, test } from "bun:test";

import { useFadeOutOnNavigate } from "~/composables/useFadeOutOnNavigate";

describe("useFadeOutOnNavigate", () => {
  test("返回 Promise<void> 且可 await", async () => {
    const p = useFadeOutOnNavigate();
    expect(p).toBeInstanceOf(Promise);
    await p;
  });
});