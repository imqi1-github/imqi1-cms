import { describe, expect, test } from "bun:test";

import { commentAvatarUrl } from "#server/utils/comment-avatar";

describe("commentAvatarUrl", () => {
  test("合法 email → gravatar URL + md5 hash", () => {
    const url = commentAvatarUrl("test@example.com", "gravatar");
    // md5('test@example.com') = 55502f40dc8b7c769880b10874abc9d0
    expect(url).toMatch(/^https:\/\/www\.gravatar\.com\/avatar\/55502f40dc8b7c769880b10874abc9d0\?d=identicon&s=80$/);
  });

  test("email 大小写无关(转小写后 hash)", () => {
    const lower = commentAvatarUrl("Test@Example.com", "gravatar");
    const upper = commentAvatarUrl("TEST@EXAMPLE.COM", "gravatar");
    expect(lower).toBe(upper);
  });

  test("email 带空格 → trim 后 hash", () => {
    const a = commentAvatarUrl("test@example.com", "gravatar");
    const b = commentAvatarUrl("  test@example.com  ", "gravatar");
    expect(a).toBe(b);
  });

  test("null email → 返回空串(与前端不渲染 img 约定对齐)", () => {
    expect(commentAvatarUrl(null, "gravatar")).toBe("");
  });

  test("空 email → 返回空串", () => {
    expect(commentAvatarUrl("", "gravatar")).toBe("");
  });

  test("cravatar 服务 → 走 cn.cravatar.com", () => {
    const url = commentAvatarUrl("a@b.com", "cravatar");
    expect(url.startsWith("https://cn.cravatar.com/avatar/")).toBe(true);
  });

  test("weavatar 服务 → 走 weavatar.com", () => {
    const url = commentAvatarUrl("a@b.com", "weavatar");
    expect(url.startsWith("https://weavatar.com/avatar/")).toBe(true);
  });

  test("未知 service 名 → 回落 gravatar", () => {
    const url = commentAvatarUrl("a@b.com", "not-a-service");
    expect(url.startsWith("https://www.gravatar.com/avatar/")).toBe(true);
  });

  test("URL 固定带 ?d=identicon&s=80(无头像时 identicon 占位 + 80px 缩略图)", () => {
    const url = commentAvatarUrl("a@b.com", "gravatar");
    expect(url).toContain("d=identicon");
    expect(url).toContain("s=80");
  });

  test("两次相同邮箱 → 完全相同 URL(确定性,便于前端缓存比对)", () => {
    const a = commentAvatarUrl("user@example.com", "gravatar");
    const b = commentAvatarUrl("user@example.com", "gravatar");
    expect(a).toBe(b);
  });
});