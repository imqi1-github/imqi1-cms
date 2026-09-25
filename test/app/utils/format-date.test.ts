import { describe, expect, test } from "bun:test";

import { formatAbsoluteDate, formatHydratedDate, formatRelativeTime } from "~/utils/formatDate";

// formatRelativeTime 内部用 new Date() 取真实当前时间,无法注入;
// 断言改为相对真实 now 的偏移
function hoursAgo(h: number): Date {
  return new Date(Date.now() - h * 3_600_000);
}

describe("formatAbsoluteDate", () => {
  test("UTC 口径,不随本地时区漂移", () => {
    expect(formatAbsoluteDate("2026-03-05T23:30:00Z")).toBe("2026-03-05");
    expect(formatAbsoluteDate(new Date(Date.UTC(2026, 11, 31)))).toBe("2026-12-31");
  });

  test("单位补零", () => {
    expect(formatAbsoluteDate(new Date(Date.UTC(2026, 0, 5)))).toBe("2026-01-05");
  });
});

describe("formatRelativeTime", () => {
  test("各粒度阶梯", () => {
    expect(formatRelativeTime(new Date(Date.now() - 30_000))).toBe("刚刚");
    expect(formatRelativeTime(hoursAgo(0.2))).toBe("12分钟前");
    expect(formatRelativeTime(hoursAgo(1))).toBe("1小时前");
    expect(formatRelativeTime(hoursAgo(5))).toBe("5小时前");
    expect(formatRelativeTime(hoursAgo(30))).toBe("1天前");
    expect(formatRelativeTime(hoursAgo(24 * 10))).toBe("1周前");
    expect(formatRelativeTime(hoursAgo(24 * 45))).toBe("1个月前");
    expect(formatRelativeTime(hoursAgo(24 * 400))).toBe("1年前");
  });

  test("未来时间差值为负 → 回落到「刚刚」", () => {
    expect(formatRelativeTime(new Date(Date.now() + 3_600_000))).toBe("刚刚");
  });
});

describe("formatHydratedDate", () => {
  test("水合前绝对日期,水合后相对时间", () => {
    const d = new Date(Date.now() - 10 * 3_600_000).toISOString();
    expect(formatHydratedDate(d, false)).toMatch(/^\d{4}-\d{2}-\d{2}$/);
    expect(formatHydratedDate(d, true)).toContain("小时前");
  });
});
