import "#test/helpers/nitro-globals";

import { afterAll, describe, expect, test } from "bun:test";

const { toAbsoluteUrl, formatRelativeTime } = await import("#server/utils/mini");

const ORIGINAL_NODE_ENV = process.env.NODE_ENV;

afterAll(() => {
  process.env.NODE_ENV = ORIGINAL_NODE_ENV;
});

describe("toAbsoluteUrl", () => {
  test("绝对地址原样返回(含查询与锚点)", () => {
    expect(toAbsoluteUrl("https://cdn.example.com/a.png?x=1#f", "http://localhost:3000")).toBe("https://cdn.example.com/a.png?x=1#f");
  });

  test("空串返回空串", () => {
    expect(toAbsoluteUrl("", "http://localhost:3000")).toBe("");
  });

  test("开发环境相对路径补 origin", () => {
    process.env.NODE_ENV = "development";
    expect(toAbsoluteUrl("/emojis/a.png", "http://localhost:3000")).toBe("http://localhost:3000/emojis/a.png");
    expect(toAbsoluteUrl("emojis/a.png", "http://localhost:3000")).toBe("http://localhost:3000/emojis/a.png");
  });
});

describe("formatRelativeTime", () => {
  test("刚刚 / 分钟 / 小时 / 天", () => {
    expect(formatRelativeTime(new Date(Date.now() - 10_000))).toBe("刚刚");
    expect(formatRelativeTime(new Date(Date.now() - 5 * 60_000))).toBe("5 分钟前");
    expect(formatRelativeTime(new Date(Date.now() - 3 * 3_600_000))).toBe("3 小时前");
    expect(formatRelativeTime(new Date(Date.now() - 2 * 86_400_000))).toBe("2 天前");
  });

  test("未来时间(差值为负)落入「刚刚」", () => {
    expect(formatRelativeTime(new Date(Date.now() + 60_000))).toBe("刚刚");
  });
});
