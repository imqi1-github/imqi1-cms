import { describe, expect, test } from "bun:test";

import {
  buildEmojiPlaceholder,
  EMOJI_CATEGORIES,
  getEmojiByKey,
  getEmojiList,
  parseEmojiContent,
  stripEmojiPrefix,
  textToEditableHtml,
} from "~/utils/emoji";

// emojis.json 真实数据驱动(启动期构建 EMOJI_KEY_MAP)
const FIRST_CAT = EMOJI_CATEGORIES[0]!;

describe("EMOJI_CATEGORIES / stripEmojiPrefix", () => {
  test("三个预设分类", () => {
    expect(EMOJI_CATEGORIES.map(c => c.dataKey)).toEqual(["Heo-Sticker", "capoo", "Cat"]);
  });

  test("stripEmojiPrefix 去前缀", () => {
    expect(stripEmojiPrefix("heo-3d眼镜", "heo-")).toBe("3d眼镜");
  });
});

describe("getEmojiList / getEmojiByKey", () => {
  test("按分类返回列表,url 过 publicAsset,含显示名", () => {
    const list = getEmojiList(FIRST_CAT.dataKey);
    expect(list.length).toBeGreaterThan(0);
    const first = list[0]!;
    expect(first.key).toBeTruthy();
    expect(first.url).toContain("/emojis/");
    expect(first.name).toBeTruthy();
  });

  test("未知分类返回空数组", () => {
    expect(getEmojiList("no-such-cat")).toEqual([]);
  });

  test("getEmojiByKey 反查:已知 key 有 path/name;未知 key undefined", () => {
    const list = getEmojiList(FIRST_CAT.dataKey);
    const known = list[0]!.key;
    expect(getEmojiByKey(known)?.path).toContain("/emojis/");
    expect(getEmojiByKey("no-such-key")).toBeUndefined();
  });
});

describe("parseEmojiContent", () => {
  test("命中占位符替换为受控 img", () => {
    const list = getEmojiList(FIRST_CAT.dataKey);
    const key = list[0]!.key;
    const html = parseEmojiContent(`看这个 :[${key}] 好看`);
    expect(html).toContain("<img");
    expect(html).toContain("inline-emoji");
  });

  test("未知占位符保留转义后原文(不为攻击者可控 key 生成 img)", () => {
    const html = parseEmojiContent("看 :[evil<script>]");
    expect(html).not.toContain("<img");
    expect(html).not.toContain("<script>");
  });

  test("原始文本先转义(防 XSS)", () => {
    const html = parseEmojiContent("<img src=x onerror=alert(1)>");
    expect(html).not.toContain("<img");
    expect(html).toContain("&lt;img");
  });

  test("空文本返回空串", () => {
    expect(parseEmojiContent("")).toBe("");
  });
});

describe("textToEditableHtml", () => {
  test("img 带 data-emoji-key 与 contenteditable=false", () => {
    const list = getEmojiList(FIRST_CAT.dataKey);
    const key = list[0]!.key;
    const html = textToEditableHtml(`:[${key}]`);
    expect(html).toContain(`data-emoji-key="${key}"`);
    expect(html).toContain("contenteditable=\"false\"");
  });

  test("未知 key 保留转义原文", () => {
    const html = textToEditableHtml(":[no-such]");
    expect(html).toContain(":[no-such]");
    expect(html).not.toContain("<img");
  });

  test("空文本返回空串", () => {
    expect(textToEditableHtml("")).toBe("");
  });
});

describe("buildEmojiPlaceholder", () => {
  test("生成 :[key] 格式占位符", () => {
    expect(buildEmojiPlaceholder("heo-微笑")).toBe(":[heo-微笑]");
  });
});
