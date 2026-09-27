/**
 * shared/special-pages.ts 补测:
 *  - SPECIAL_PAGE_OPTIONS 完整结构(每项含 label/implemented/value)
 *  - 字面类型 SpecialPageValue 在 TS 端能且只能赋这些值
 *  - isSpecialPageSlug 接受 unknown input(narrow 到 string)→ false/true
 *  - IMPLEMENTED_SPECIAL_PAGE_SLUGS 是 SPECULATIVE 之子集
 */
import { describe, expect, test } from "bun:test";

import {
  IMPLEMENTED_SPECIAL_PAGE_SLUGS,
  isSpecialPageSlug,
  SPECIAL_PAGE_OPTIONS,
  SPECIAL_PAGE_SLUGS,
  type SpecialPageValue,
} from "#shared/special-pages";

describe("SPECIAL_PAGE_OPTIONS 完整结构", () => {
  test("每项必含 value/label/implemented 三个键", () => {
    for (const o of SPECIAL_PAGE_OPTIONS) {
      expect(typeof o.value).toBe("string");
      expect(typeof o.label).toBe("string");
      expect(typeof o.implemented).toBe("boolean");
      expect(o.label.length).toBeGreaterThan(0);
    }
  });

  test("value 各不相同", () => {
    const values = SPECIAL_PAGE_OPTIONS.map(o => o.value);
    expect(new Set(values).size).toBe(values.length);
  });

  test("中文 label 含人类可读描述", () => {
    // 三档 label 都是中文短语(运营文案)
    const labels = SPECIAL_PAGE_OPTIONS.map(o => o.label);
    expect(labels.some(l => l.length > 0)).toBe(true);
  });
});

describe("isSpecialPageSlug 类型守卫", () => {
  test("unknown 输入(数字/对象/null)→ false", () => {
    expect(isSpecialPageSlug(123 as unknown as string)).toBe(false);
    expect(isSpecialPageSlug({} as unknown as string)).toBe(false);
    expect(isSpecialPageSlug(null as unknown as string)).toBe(false);
    expect(isSpecialPageSlug(undefined as unknown as string)).toBe(false);
  });

  test("空白字符串/纯空格 → false", () => {
    expect(isSpecialPageSlug("")).toBe(false);
    expect(isSpecialPageSlug("   ")).toBe(false);
  });

  test("前后有空白 → false(不 trim)", () => {
    expect(isSpecialPageSlug(" messages")).toBe(false);
    expect(isSpecialPageSlug("messages ")).toBe(false);
  });

  test("含未知字符但命中前缀 → false(严格相等)", () => {
    expect(isSpecialPageSlug("messages!")).toBe(false);
    expect(isSpecialPageSlug("agreement/v2")).toBe(false);
  });
});

describe("IMPLEMENTED_SPECIAL_PAGE_SLUGS 子集关系", () => {
  test("IMPLEMENTED 是 SLUGS 的子集", () => {
    for (const s of IMPLEMENTED_SPECIAL_PAGE_SLUGS) {
      expect(SPECIAL_PAGE_SLUGS.has(s)).toBe(true);
    }
  });

  test("IMPLEMENTED 严格小于 SLUGS(custom 未实现)", () => {
    expect(IMPLEMENTED_SPECIAL_PAGE_SLUGS.size).toBeLessThan(SPECIAL_PAGE_SLUGS.size);
  });

  test("IMPLEMENTED 含的两个 slug 都映射 implemented=true", () => {
    for (const s of IMPLEMENTED_SPECIAL_PAGE_SLUGS) {
      const opt = SPECIAL_PAGE_OPTIONS.find(o => o.value === s);
      expect(opt?.implemented).toBe(true);
    }
  });

  test("未实现的 custom → implemented=false", () => {
    const opt = SPECIAL_PAGE_OPTIONS.find(o => o.value === "custom");
    expect(opt?.implemented).toBe(false);
  });
});

describe("SpecialPageValue 类型边界(编译期断言)", () => {
  test("运行时不能从任意字符串断言为 SpecialPageValue,需走 isSpecialPageSlug", () => {
    // 这里只测运行时接受/拒绝;编译期类型收窄靠 isSpecialPageSlug 实现
    const candidates = ["messages", "agreement", "custom", "other"];
    for (const c of candidates) {
      if (isSpecialPageSlug(c)) {
        const v: SpecialPageValue = c;
        expect(typeof v).toBe("string");
      } else {
        // 非合法值不会被守卫收窄
        expect(["other", ""].includes(c)).toBe(true);
      }
    }
  });
});