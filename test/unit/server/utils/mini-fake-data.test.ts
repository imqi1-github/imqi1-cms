import { describe, expect, test } from "bun:test";

import {
  MINI_FAKE_CATEGORY,
  MINI_FAKE_CONTENT_ID,
} from "#server/utils/mini-fake-data";

describe("mini 审核模式占位数据", () => {
  test("占位文章 id 与分类自洽", () => {
    expect(MINI_FAKE_CONTENT_ID).toBe(1);
    expect(MINI_FAKE_CATEGORY.mid).toBe(1);
    expect(MINI_FAKE_CATEGORY.slug).toBe("demo");
  });
});
