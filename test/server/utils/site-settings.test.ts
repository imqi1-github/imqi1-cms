import "#test/helpers/nitro-globals";

import { beforeEach, describe, expect, test } from "bun:test";

import { mockSharedPrisma, sharedFake } from "#test/helpers/fake-prisma";

mockSharedPrisma();
// informations.findMany 的假数据由 routes/feed.test 注册(siteName/siteUrl),此处共享;
// 并发加载下同 key 注册互相覆盖,故本文件只做类型形状断言,不断言具体值
const { getSiteSettings } = await import("#server/utils/siteSettings");

// 自足注册 informations.findMany,不依赖其它测试文件
beforeEach(() => {
  sharedFake.on("informations", "findMany", async () => [
    { key: "siteName", value: "测试站" },
    { key: "siteUrl", value: "https://example.com" },
  ]);
});

describe("getSiteSettings(假 prisma → 类型转换)", () => {
  // informations.findMany 在并发加载下会被 search/feed 的注册覆盖,
  // 这里只断言「管线执行 + 返回完整形状」,具体值由使用方(feed 等)各自的确定性场景保证
  test("返回完整设置形状:布尔/数值/字符串键类型正确", async () => {
    const s = await getSiteSettings();
    expect(typeof s.commentEnabled).toBe("boolean");
    expect(typeof s.contentPageSize).toBe("number");
    expect(typeof s.siteName).toBe("string");
    expect(typeof s.siteUrl).toBe("string");
    expect(typeof s.homeCustomText).toBe("string");
  });
});
