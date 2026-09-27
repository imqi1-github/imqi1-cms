/**
 * shared/emoji-categories.ts 集成测(纯函数,直接 import 真实现):
 *  - EMOJI_CATEGORIES 数组结构(dataKey/label/prefix)
 *  - 3 个分类:Heo-Sticker / capoo / Cat
 *  - stripEmojiPrefix:
 *    - 标准匹配 → 去前缀
 *    - 不匹配(不同前缀)→ 原样返回
 *    - 空字符串 → 空字符串(不抛)
 *    - 仅前缀本身(无 key 部分)→ 空字符串(把整个串当作前缀剥掉)
 */
import { describe, expect, test } from "bun:test";

import { EMOJI_CATEGORIES, stripEmojiPrefix } from "#shared/emoji-categories";

describe("EMOJI_CATEGORIES", () => {
  test("三个分类,顺序固定(变更需同步 emoji.ts 与 emoji-mail.ts)", () => {
    expect(EMOJI_CATEGORIES).toEqual([
      { dataKey: "Heo-Sticker", label: "Heo表情", prefix: "heo-" },
      { dataKey: "capoo", label: "猫猫虫", prefix: "猫猫虫-" },
      { dataKey: "Cat", label: "猫咪", prefix: "cat-" },
    ]);
  });

  test("每个分类都有完整三字段(dataKey/label/prefix)", () => {
    for (const c of EMOJI_CATEGORIES) {
      expect(typeof c.dataKey).toBe("string");
      expect(typeof c.label).toBe("string");
      expect(typeof c.prefix).toBe("string");
      expect(c.dataKey.length).toBeGreaterThan(0);
      expect(c.label.length).toBeGreaterThan(0);
      expect(c.prefix.length).toBeGreaterThan(0);
    }
  });

  test("dataKey 不重复(prefix 可重复,dataKey 必须唯一)", () => {
    const keys = EMOJI_CATEGORIES.map(c => c.dataKey);
    expect(new Set(keys).size).toBe(keys.length);
  });
});

describe("stripEmojiPrefix", () => {
  test("标准匹配 → 去前缀", () => {
    expect(stripEmojiPrefix("heo-smile", "heo-")).toBe("smile");
    expect(stripEmojiPrefix("cat-haha", "cat-")).toBe("haha");
    expect(stripEmojiPrefix("猫猫虫-开心", "猫猫虫-")).toBe("开心");
  });

  test("前缀不匹配(其它分类的前缀)→ 原样返回", () => {
    expect(stripEmojiPrefix("cat-smile", "heo-")).toBe("cat-smile");
    expect(stripEmojiPrefix("heo-smile", "cat-")).toBe("heo-smile");
  });

  test("完全没有前缀 → 原样返回", () => {
    expect(stripEmojiPrefix("smile", "heo-")).toBe("smile");
  });

  test("空字符串 → 空字符串(不抛)", () => {
    expect(stripEmojiPrefix("", "heo-")).toBe("");
  });

  test("仅前缀本身(无 key 部分)→ 空字符串", () => {
    expect(stripEmojiPrefix("heo-", "heo-")).toBe("");
    expect(stripEmojiPrefix("猫猫虫-", "猫猫虫-")).toBe("");
  });

  test("大小写敏感:大写 HEO- 前缀不会匹配小写 heo-", () => {
    // 实现用 startsWith,不规范化大小写(测试契约:大小写敏感)
    expect(stripEmojiPrefix("HEO-smile", "heo-")).toBe("HEO-smile");
  });
});