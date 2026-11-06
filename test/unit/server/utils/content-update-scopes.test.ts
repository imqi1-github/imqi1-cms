/**
 * 内容更新 → 影响面（scope）判定。
 *
 * 判定错了的后果不对称：
 * - 少判一个展示面 → 那一处挂满源站 TTL（6 小时），用户看到旧内容；
 * - 多判一个 → 白刷几个额度（可接受）。
 * 所以每种字段变化都要有明确的用例。
 */
import { describe, expect, test } from "bun:test";
import "#test/helpers/nitro-globals";

import { contentUpdateScopes } from "#server/utils/content-scopes";

/** 更新前的文章记录 */
const existing = {
  title: "旧标题",
  desc: "旧摘要",
  slug: "old-slug",
  covers: "[]",
  many_covers: false,
  status: 1,
  type: 0,
  create_time: new Date("2026-01-01T00:00:00Z"),
};

describe("内容更新的影响面", () => {
  test("只改正文 → 只刷文章页", () => {
    expect(contentUpdateScopes(existing, { content: "新正文" })).toEqual(["article"]);
  });

  test("改标题 → 文章页 + 显示卡片的地方 + 引用它的页", () => {
    expect(contentUpdateScopes(existing, { title: "新标题" }).sort())
      .toEqual(["article", "card", "related"]);
  });

  test("改摘要 → 同改标题（卡片上显示摘要）", () => {
    expect(contentUpdateScopes(existing, { desc: "新摘要" }).sort())
      .toEqual(["article", "card", "related"]);
  });

  test("改封面 → 同改标题（卡片上显示封面）", () => {
    expect(contentUpdateScopes(existing, { covers: '[{"url":"a.jpg"}]' }).sort())
      .toEqual(["article", "card", "related"]);
  });

  test("改 slug → 卡片上的链接变了 → 同样要刷卡片与引用页", () => {
    expect(contentUpdateScopes(existing, { slug: "new-slug" }).sort())
      .toEqual(["article", "card", "related"]);
  });

  test("改发布状态 → 进出列表 → 页码位移 → 刷列表目录", () => {
    expect(contentUpdateScopes(existing, { statusNum: 0 }).sort())
      .toEqual(["article", "card", "listDir"]);
  });

  test("改创建时间 → 列表排序变了 → 刷列表目录", () => {
    expect(contentUpdateScopes(existing, { publishDate: "2026-02-02" }).sort())
      .toEqual(["article", "card", "listDir"]);
  });

  test("改类型（文章↔独立页）→ 进出列表 + 独立页的固定页", () => {
    expect(contentUpdateScopes(existing, { typeNum: 1 }).sort())
      .toEqual(["article", "card", "fixed", "listDir"]);
  });

  test("字段没变（传了同样的值）→ 只刷文章页", () => {
    expect(contentUpdateScopes(existing, { title: existing.title, desc: existing.desc })).toEqual(["article"]);
  });

  test("未提供的字段（undefined）视为不更新 → 不触发额外展示面", () => {
    expect(contentUpdateScopes(existing, { title: undefined, desc: undefined, statusNum: undefined })).toEqual(["article"]);
  });
});
