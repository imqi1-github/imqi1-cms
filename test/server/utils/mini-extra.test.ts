import "#test/helpers/nitro-globals";

import { describe, expect, test } from "bun:test";

import { mockSharedPrisma, sharedFake } from "#test/helpers/fake-prisma";

mockSharedPrisma();

sharedFake.on("informations", "findUnique", (args: { where: { key: string } }) =>
  args.where.key === "photoCategorySlug" ? { value: "album" } : null);
sharedFake.on("metas", "findFirst", (args: { where: { slug: string; type: string } }) => {
  // 同 slug 的 tag 不应命中(type 判别)
  if (args.where.slug === "album" && args.where.type === "category") return { mid: 42 };
  return null;
});

const { getPhotoCategoryMid, toHttps, formatRelativeTime } = await import("#server/utils/mini");

describe("toHttps", () => {
  test("http 升级为 https,已是 https 不变,大小写不敏感", () => {
    expect(toHttps("http://m701.music.126.net/a.mp3")).toBe("https://m701.music.126.net/a.mp3");
    expect(toHttps("HTTP://x.com/a.mp3")).toBe("https://x.com/a.mp3");
    expect(toHttps("https://x.com/a.mp3")).toBe("https://x.com/a.mp3");
  });

  test("无协议串不改变", () => {
    expect(toHttps("//x.com/a.mp3")).toBe("//x.com/a.mp3");
  });
});

describe("formatRelativeTime 更长跨度", () => {
  test("周 / 月 / 年", () => {
    expect(formatRelativeTime(new Date(Date.now() - 10 * 86_400_000))).toBe("1 周前");
    expect(formatRelativeTime(new Date(Date.now() - 60 * 86_400_000))).toBe("2 个月前");
    expect(formatRelativeTime(new Date(Date.now() - 400 * 86_400_000))).toBe("1 年前");
  });
});

describe("getPhotoCategoryMid", () => {
  test("按 slug + type=category 查 mid", async () => {
    expect(await getPhotoCategoryMid()).toBe(42);
  });
});
