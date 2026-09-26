import { describe, expect, test } from "bun:test";

import { useAdminPageSize } from "~/composables/useAdminPageSize";

describe("useAdminPageSize fallback path (import.meta.client=false 测试环境)", () => {
  test("无存储/localStorage 不可用时回落到 fallback", () => {
    const { pageSize } = useAdminPageSize(20);
    expect(pageSize.value).toBe(20);
  });

  test("fallback < ADMIN_PAGE_SIZE_MIN 时仍以 fallback 为准(不二次回弹到 10)", () => {
    // clampAdminPageSize 行为:Math.floor(Number(0))=0,小于 MIN(1)时返回 fallback 本身(=0)。
    // 用户传 0 → pageSize 也是 0;此断言锁定这个边界,而不是默认 10。
    const { pageSize } = useAdminPageSize(0);
    expect(pageSize.value).toBe(0);
  });

  test("fallback 超 ADMIN_PAGE_SIZE_MAX(1000)被钳到 1000", () => {
    const { pageSize } = useAdminPageSize(99999);
    expect(pageSize.value).toBe(1000);
  });

  test("返回 pageSize 是 ref,可读写", () => {
    const { pageSize } = useAdminPageSize(10);
    pageSize.value = 25;
    expect(pageSize.value).toBe(25);
  });
});