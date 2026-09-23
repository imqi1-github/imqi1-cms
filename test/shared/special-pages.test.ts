import { describe, expect, test } from "bun:test";

import {
  IMPLEMENTED_SPECIAL_PAGE_SLUGS,
  isSpecialPageSlug,
  SPECIAL_PAGE_OPTIONS,
  SPECIAL_PAGE_SLUGS,
  type SpecialPageValue,
} from "../../shared/special-pages";

describe("SPECIAL_PAGE_OPTIONS", () => {
  test("只含三个预设: messages / agreement / custom", () => {
    expect(SPECIAL_PAGE_OPTIONS.map(o => o.value)).toEqual(["messages", "agreement", "custom"]);
  });

  test("只有 messages / agreement 标记为已实现", () => {
    const implemented = SPECIAL_PAGE_OPTIONS.filter(o => o.implemented).map(o => o.value);
    expect(implemented).toEqual(["messages", "agreement"]);
  });
});

describe("SPECIAL_PAGE_SLUGS", () => {
  test("包含所有预设值(含未实现的 custom)", () => {
    expect([...SPECIAL_PAGE_SLUGS].sort()).toEqual(["agreement", "custom", "messages"]);
  });
});

describe("IMPLEMENTED_SPECIAL_PAGE_SLUGS", () => {
  test("仅含已实现的两项,不含 custom", () => {
    expect([...IMPLEMENTED_SPECIAL_PAGE_SLUGS].sort()).toEqual(["agreement", "messages"]);
  });
});

describe("isSpecialPageSlug", () => {
  test("命中预设返回 true 且类型收窄为 SpecialPageValue", () => {
    const r: string = "messages";
    if (isSpecialPageSlug(r)) {
      // 编译期应能赋给 SpecialPageValue,这里只确认值相等
      const v: SpecialPageValue = r;
      expect(v).toBe("messages");
    } else {
      throw new Error("应当返回 true");
    }
  });

  test("包含未实现的 custom", () => {
    expect(isSpecialPageSlug("custom")).toBe(true);
  });

  test("非预设 slug 返回 false", () => {
    expect(isSpecialPageSlug("about")).toBe(false);
    expect(isSpecialPageSlug("")).toBe(false);
    expect(isSpecialPageSlug("Messages")).toBe(false); // 大小写敏感
  });
});
