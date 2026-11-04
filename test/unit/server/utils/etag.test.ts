// 页面 ETag：同一份内容必须算出同一个 ETag（否则 304 永远不生效），
// 内容变了必须变；条件请求头的匹配要认 `*`、多值列表与 W/ 弱前缀。
import { describe, expect, test } from "bun:test";

import { computeEtag, matchesIfNoneMatch, normalizePayload } from "#server/utils/etag";

/** 造一个 Nuxt 风格的 payload 脚本：timeSsrStart 的值存在数组别处（devalue 扁平格式） */
function htmlWithPayload(timeSsrStart: number, extra = ""): string {
  // 下标 3 处是时间戳，对象里的 timeSsrStart 存的就是这个下标
  const payload = ["a", "b", { timeSsrStart: 3 }, timeSsrStart, extra];
  return `<html><body>hi</body><script type="application/json" data-nuxt-data="nuxt-app">${JSON.stringify(payload)}</script></html>`;
}

describe("ETag", () => {
  test("同一份内容 → 同一个 ETag", () => {
    expect(computeEtag("<html>same</html>")).toBe(computeEtag("<html>same</html>"));
  });

  test("内容不同 → ETag 不同", () => {
    expect(computeEtag("<html>a</html>")).not.toBe(computeEtag("<html>b</html>"));
  });

  test("payload 的 timeSsrStart 变化不影响 ETag（否则 304 永不生效）", () => {
    expect(computeEtag(htmlWithPayload(1793768090589))).toBe(computeEtag(htmlWithPayload(1793768096176)));
  });

  test("payload 的真实内容变化会影响 ETag（不能把内容差异一起抹掉）", () => {
    expect(computeEtag(htmlWithPayload(1793768090589, "a"))).not.toBe(computeEtag(htmlWithPayload(1793768090589, "b")));
  });

  test("payload 不是合法 JSON 时原样返回（ETag 会变，但不影响正确性）", () => {
    const broken = '<html><script type="application/json" data-nuxt-data="nuxt-app">{bad json</script></html>';
    expect(normalizePayload(broken)).toBe(broken);
    expect(computeEtag(broken)).toBe(computeEtag(broken));
  });

  test("ETag 是带引号的强校验器", () => {
    expect(computeEtag("<html>x</html>")).toMatch(/^"[A-Za-z0-9_-]+"$/);
  });
});

describe("If-None-Match 匹配", () => {
  const etag = computeEtag("<html>x</html>");

  test("无请求头 → 不命中", () => {
    expect(matchesIfNoneMatch(undefined, etag)).toBe(false);
  });

  test("完全相同 → 命中", () => {
    expect(matchesIfNoneMatch(etag, etag)).toBe(true);
  });

  test("多值列表里命中其一 → 命中", () => {
    expect(matchesIfNoneMatch(`"other", ${etag}`, etag)).toBe(true);
  });

  test("W/ 弱前缀 → 命中", () => {
    expect(matchesIfNoneMatch(`W/${etag}`, etag)).toBe(true);
  });

  test("`*` → 命中", () => {
    expect(matchesIfNoneMatch("*", etag)).toBe(true);
  });

  test("不匹配 → 不命中", () => {
    expect(matchesIfNoneMatch('"nope"', etag)).toBe(false);
  });
});
