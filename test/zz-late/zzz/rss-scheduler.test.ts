import "#test/helpers/nitro-globals";

import { describe, expect, mock, test } from "bun:test";

import { mockSharedPrisma, sharedFake } from "#test/helpers/fake-prisma";

// 本文件 mock 掉 #server/utils/rss 且无法撤销,故放目录序最末(zzz):
// 任何需要真实 rss 的测试(server/utils/zz-rss.test.ts)都排在它之前。
// 插件只验证注册与单例守卫(真实更新在 1 小时定时器上,不触发)
sharedFake.on("informations", "findFirst", () => ({ value: "8" }));
mockSharedPrisma();
mock.module("#server/utils/rss", () => ({
  updateAllSubscribes: async () => ({ success: 0, total: 0 }),
}));

const plugin = (await import("#server/plugins/rss-scheduler")).default as () => void;

describe("rss-scheduler 插件", () => {
  test("注册即启动调度且不抛;重复注册被单例守卫挡住", () => {
    expect(() => plugin()).not.toThrow();
    expect(() => plugin()).not.toThrow();
  });
});
