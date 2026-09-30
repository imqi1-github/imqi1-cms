import { describe, expect, test } from "bun:test";

import {
  CHANGELOG_META,
  CHANGELOG_META_FALLBACK,
  CHANGELOG_TYPES,
  getChangelogMeta,
  isChangelogType,
  type ChangelogType,
} from "#shared/changelog";

describe("CHANGELOG_TYPES", () => {
  test("包含 7 个类别(顺序也是展示顺序)", () => {
    expect(CHANGELOG_TYPES).toEqual([
      "功能",
      "优化",
      "修复",
      "删除",
      "设计",
      "新增",
      "其他",
    ]);
  });

  test("只读数组类型", () => {
    expect(Array.isArray(CHANGELOG_TYPES)).toBe(true);
  });
});

describe("isChangelogType", () => {
  test("合法类型全部返回 true", () => {
    for (const t of CHANGELOG_TYPES) {
      expect(isChangelogType(t)).toBe(true);
    }
  });

  test("未知字符串返回 false", () => {
    expect(isChangelogType("未知")).toBe(false);
    expect(isChangelogType("")).toBe(false);
    expect(isChangelogType("function")).toBe(false); // 英文不算
    expect(isChangelogType("功能 ")).toBe(false); // 含空格
  });

  test("非字符串类型全部 false", () => {
    expect(isChangelogType(null)).toBe(false);
    expect(isChangelogType(undefined)).toBe(false);
    expect(isChangelogType(123)).toBe(false);
    expect(isChangelogType({})).toBe(false);
    expect(isChangelogType([])).toBe(false);
    expect(isChangelogType(true)).toBe(false);
  });
});

describe("CHANGELOG_META", () => {
  test("每个 CHANGELOG_TYPES 都有对应 meta 条目", () => {
    for (const t of CHANGELOG_TYPES) {
      expect(CHANGELOG_META[t]).toBeDefined();
    }
  });

  test("meta 必含 color/icon/label 三字段", () => {
    for (const t of CHANGELOG_TYPES) {
      const meta = CHANGELOG_META[t];
      expect(typeof meta.color).toBe("string");
      expect(meta.color.length).toBeGreaterThan(0);
      expect(typeof meta.icon).toBe("string");
      expect(meta.icon.startsWith("lucide:")).toBe(true);
      expect(typeof meta.label).toBe("string");
      expect(meta.label.length).toBeGreaterThan(0);
    }
  });

  test("label 与类型名一致(便于后台导入显示)", () => {
    for (const t of CHANGELOG_TYPES) {
      expect(CHANGELOG_META[t].label).toBe(t);
    }
  });

  test("color 含 dark: 变体,适配深色模式", () => {
    for (const t of CHANGELOG_TYPES) {
      expect(CHANGELOG_META[t].color).toContain("dark:");
    }
  });

  test("每个 type 的 color/icon 不重复", () => {
    const colors = new Set(CHANGELOG_TYPES.map(t => CHANGELOG_META[t].color));
    const icons = new Set(CHANGELOG_TYPES.map(t => CHANGELOG_META[t].icon));
    expect(colors.size).toBe(CHANGELOG_TYPES.length);
    expect(icons.size).toBe(CHANGELOG_TYPES.length);
  });
});

describe("CHANGELOG_META_FALLBACK", () => {
  test("兜底含 color/icon/label", () => {
    expect(CHANGELOG_META_FALLBACK.color).toBeDefined();
    expect(CHANGELOG_META_FALLBACK.icon).toBe("lucide:circle-dashed");
    expect(CHANGELOG_META_FALLBACK.label).toBe("其他");
  });

  test("兜底颜色与「其他」一致", () => {
    expect(CHANGELOG_META_FALLBACK.color).toBe(CHANGELOG_META.其他.color);
  });
});

describe("getChangelogMeta", () => {
  test("合法 type 返回对应 meta(等价于直接索引)", () => {
    const type: ChangelogType = "修复";
    expect(getChangelogMeta(type)).toEqual(CHANGELOG_META.修复);
  });

  test("未知类型返回兜底", () => {
    expect(getChangelogMeta("未知")).toEqual(CHANGELOG_META_FALLBACK);
    expect(getChangelogMeta("")).toEqual(CHANGELOG_META_FALLBACK);
  });

  test("非字符串类型返回兜底", () => {
    expect(getChangelogMeta(null as unknown as string)).toEqual(CHANGELOG_META_FALLBACK);
    expect(getChangelogMeta(undefined as unknown as string)).toEqual(CHANGELOG_META_FALLBACK);
    expect(getChangelogMeta(123 as unknown as string)).toEqual(CHANGELOG_META_FALLBACK);
  });
});