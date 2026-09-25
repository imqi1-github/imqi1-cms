import "#test/helpers/nitro-globals";

import { beforeEach, describe, expect, test } from "bun:test";

import { mockSharedPrisma, sharedFake } from "#test/helpers/fake-prisma";
import { siteConfig } from "~~/site.config";

mockSharedPrisma();

const { clampAdminPageSize, ADMIN_PAGE_SIZE_MIN, ADMIN_PAGE_SIZE_MAX } = await import("#shared/constants");
const {
  normalizeChangelogEntries,
  parseChangelogContent,
  stringifyChangelogContent,
  renderChangelogEntries,
  renderChangelogContent,
} = await import("#server/utils/changelog");
const { DatabaseSessionStore } = await import("#server/utils/session-store");
const { isMiniFakeDataEnabled, miniCommentsEnabled, MINI_FAKE_CONTENT_ID, MINI_FAKE_CATEGORY } = await import("#server/utils/mini-fake-data");
const { isPrismaNotFoundError } = await import("#server/utils/prisma");

describe("shared/constants clampAdminPageSize", () => {
  test("非数字/NaN/小于下限 → 回落 fallback", () => {
    expect(clampAdminPageSize("abc")).toBe(10);
    expect(clampAdminPageSize(NaN)).toBe(10);
    expect(clampAdminPageSize(ADMIN_PAGE_SIZE_MIN - 1)).toBe(10);
    expect(clampAdminPageSize(null, 20)).toBe(20);
  });

  test("超过上限 → 钳到上限;区间内原样(向下取整)", () => {
    expect(clampAdminPageSize(ADMIN_PAGE_SIZE_MAX + 100)).toBe(ADMIN_PAGE_SIZE_MAX);
    expect(clampAdminPageSize(ADMIN_PAGE_SIZE_MIN)).toBe(ADMIN_PAGE_SIZE_MIN);
    expect(clampAdminPageSize(15.9)).toBe(15);
  });
});

describe("utils/changelog", () => {
  test("normalizeChangelogEntries:合法条目透传、非法类型归为其他、非数组回空", () => {
    expect(normalizeChangelogEntries([{ type: "修复", value: "x" }])).toEqual([{ type: "修复", value: "x" }]);
    expect(normalizeChangelogEntries([{ type: "不存在", value: "x" }])).toEqual([{ type: "其他", value: "x" }]);
    // 非数组 → 当作单条(兼容迁移前的纯文本 desc)
    expect(normalizeChangelogEntries("not-array")).toEqual([{ type: "其他", value: "not-array" }]);
    expect(normalizeChangelogEntries(null)).toEqual([]);
  });

  test("parse/stringify 往返一致;坏 JSON 回空数组", () => {
    const entries = [{ type: "功能" as const, value: "新功能" }];
    expect(parseChangelogContent(stringifyChangelogContent(entries))).toEqual(entries);
    // 坏 JSON → 当作单段旧文本(不丢内容)
    expect(parseChangelogContent("{bad")).toEqual([{ type: "其他", value: "{bad" }]);
    expect(parseChangelogContent(null)).toEqual([]);
  });

  test("renderChangelogEntries:附带渲染好的 html(markdown 已转)", () => {
    const rendered = renderChangelogEntries([{ type: "修复", value: "**修了** bug" }]);
    expect(rendered[0]).toMatchObject({ type: "修复", value: "**修了** bug" });
    expect(rendered[0]!.html).toContain("<strong>修了</strong>");
  });

  test("renderChangelogContent:直接吃原始 JSON 串", () => {
    const r = renderChangelogContent(JSON.stringify([{ type: "优化", value: "更快" }]));
    expect(r[0]!.value).toBe("更快");
  });
});

describe("utils/session-store DatabaseSessionStore", () => {
  const store = new DatabaseSessionStore();
  let sessions = new Map<string, { userId: number; authCode: string; expires: Date }>();

  beforeEach(() => {
    sessions = new Map();
    sharedFake.on("sessions", "findUnique", async ({ where }: { where: { id: string } }) => sessions.get(where.id) ?? null);
    sharedFake.on("sessions", "upsert", async ({ where, create }: { where: { id: string }; create: { userId: number; authCode: string; expires: Date } }) => {
      sessions.set(where.id, { ...create });
      return create;
    });
    sharedFake.on("sessions", "delete", async ({ where }: { where: { id: string } }) => {
      sessions.delete(where.id);
      return {};
    });
    sharedFake.on("sessions", "deleteMany", async () => ({ count: sessions.size }));
  });

  test("set/get 往返;过期会话 get 时删除并返回 null", async () => {
    const live = { userId: 1, authCode: "a", expires: Date.now() + 60_000 };
    await store.set("s-live", live);
    const got = await store.get("s-live");
    expect(got).toMatchObject({ userId: 1, authCode: "a", expires: live.expires });

    await store.set("s-exp", { userId: 1, authCode: "b", expires: Date.now() - 1000 });
    expect(await store.get("s-exp")).toBeNull();
    expect(sessions.has("s-exp")).toBe(false);
  });

  test("未记录的 sessionId → null;delete/clearUserSessions 可调用", async () => {
    expect(await store.get("nope")).toBeNull();
    await store.set("s1", { userId: 7, authCode: "c", expires: Date.now() + 1000 });
    await store.delete("s1");
    expect(sessions.has("s1")).toBe(false);
    await expect(store.clearUserSessions(7)).resolves.toBeUndefined();
    await expect(store.cleanup()).resolves.toBeUndefined();
  });
});

describe("utils/mini-fake-data 开关", () => {
  test("isMiniFakeDataEnabled 跟随 site.config 的 features.miniFakeData", () => {
    expect(isMiniFakeDataEnabled()).toBe(siteConfig.features.miniFakeData);
  });

  test("miniCommentsEnabled = miniComment 且非审核模式", () => {
    expect(miniCommentsEnabled()).toBe(Boolean(siteConfig.features.miniComment) && !siteConfig.features.miniFakeData);
  });

  test("占位数据自洽:文章 id 与分类 mid/slug", () => {
    expect(MINI_FAKE_CONTENT_ID).toBe(1);
    expect(MINI_FAKE_CATEGORY).toMatchObject({ mid: 1, slug: "demo" });
  });
});

describe("utils/prisma isPrismaNotFoundError", () => {
  test("P2025 判真;其它 code/非错误对象判假", () => {
    expect(isPrismaNotFoundError(Object.assign(new Error("x"), { code: "P2025" }))).toBe(true);
    expect(isPrismaNotFoundError(Object.assign(new Error("x"), { code: "P2002" }))).toBe(false);
    expect(isPrismaNotFoundError(new Error("x"))).toBe(false);
    expect(isPrismaNotFoundError(null)).toBe(false);
    expect(isPrismaNotFoundError("str")).toBe(false);
  });
});
