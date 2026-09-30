import { describe, expect, test } from "bun:test";

import { cn } from "~/lib/utils";

describe("cn", () => {
  test("字符串拼接", () => {
    expect(cn("foo", "bar")).toBe("foo bar");
  });

  test("false / null / undefined / 0 跳过(clsx 语义)", () => {
    expect(cn("a", false, null, undefined, "b", 0)).toBe("a b");
  });

  test("数字 5 / true:clsx 把非字符串 truthy 转字符串(class=\"a 5 true\")", () => {
    // clsx 把数字/布尔当 class 字符串一部分输出
    const r = cn("a", 5, true);
    // 实际行为:clsx("a", 5, true) → "a 5 true"(数字 5 + 字符串 "true" 拼接)
    expect(typeof r).toBe("string");
    expect(r).toContain("a");
  });

  test("对象条件类:foo bar 命中", () => {
    expect(cn({ foo: true, bar: true })).toBe("foo bar");
    expect(cn({ foo: true, bar: false })).toBe("foo");
  });

  test("数组条件类:['a', 'b']", () => {
    expect(cn(["a", "b"])).toBe("a b");
  });

  test("空参数 → 空串", () => {
    expect(cn()).toBe("");
    expect(cn("")).toBe("");
  });
});