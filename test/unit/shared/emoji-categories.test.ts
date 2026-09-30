import { describe, expect, test } from "bun:test";

import {
  EMOJI_CATEGORIES,
  stripEmojiPrefix,
  type EmojiCategoryMeta,
} from "#shared/emoji-categories";

describe("EMOJI_CATEGORIES", () => {
  test("包含三个预设分类", () => {
    expect(EMOJI_CATEGORIES.map(c => c.dataKey)).toEqual([
      "Heo-Sticker",
      "capoo",
      "Cat",
    ]);
  });

  test("每条都满足 EmojiCategoryMeta 形状: dataKey / label / prefix 三个非空串", () => {
    for (const c of EMOJI_CATEGORIES as EmojiCategoryMeta[]) {
      expect(typeof c.dataKey).toBe("string");
      expect(c.dataKey.length).toBeGreaterThan(0);
      expect(typeof c.label).toBe("string");
      expect(c.label.length).toBeGreaterThan(0);
      expect(typeof c.prefix).toBe("string");
      expect(c.prefix.length).toBeGreaterThan(0);
    }
  });
});

describe("stripEmojiPrefix", () => {
  test("命中前缀时去掉前缀", () => {
    expect(stripEmojiPrefix("cat-smile", "cat-")).toBe("smile");
    expect(stripEmojiPrefix("heo-笑", "heo-")).toBe("笑");
  });

  test("未命中前缀时原样返回(避免错误切掉中间段)", () => {
    // 不以前缀开头 → 不该切,例如 "smile-cat" 不该变成 "smile-"
    expect(stripEmojiPrefix("smile-cat", "cat-")).toBe("smile-cat");
  });

  test("空串输入原样返回", () => {
    expect(stripEmojiPrefix("", "cat-")).toBe("");
  });

  test("恰好等于前缀时返回空串", () => {
    expect(stripEmojiPrefix("cat-", "cat-")).toBe("");
  });
});
