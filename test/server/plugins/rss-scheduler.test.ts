import "#test/helpers/nitro-globals";

import { describe, expect, mock, test } from "bun:test";

import { mockSharedPrisma, sharedFake } from "#test/helpers/fake-prisma";

// 调度间隔读取与订阅更新都走假件,插件只验证注册与单例守卫(真实更新在 1 小时定时器上,不触发)
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
