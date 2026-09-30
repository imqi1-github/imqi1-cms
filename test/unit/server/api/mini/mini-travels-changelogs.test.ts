import "#test/helpers/nitro-globals";

import { beforeEach, describe, expect, mock, test } from "bun:test";

import { makeAuthEvent } from "#test/helpers/auth-fakes";
import { mockSharedPrisma, sharedFake } from "#test/helpers/fake-prisma";

mockSharedPrisma();

let fakeDataEnabled = false;
const realMiniFake = await import("#server/utils/mini-fake-data");
mock.module("#server/utils/mini-fake-data", () => ({
  ...realMiniFake,
  isMiniFakeDataEnabled: () => fakeDataEnabled,
}));

let photoMid: number | undefined = 5;
const realMini = await import("#server/utils/mini");
mock.module("#server/utils/mini", () => ({ ...realMini, getPhotoCategoryMid: async () => photoMid }));

const travels = [
  {
    id: 1, name: "北京", desc: null, cover: "/imgs/bj.jpg",
    contenttravels: [
      { content: { cid: 1, title: "游记", contentrelations: [{ mid: 5 }] } },
      { content: { cid: 2, title: "普通文", contentrelations: [] } },
    ],
  },
  { id: 2, name: "无封面无文章", desc: "描述", cover: null, contenttravels: [] },
];
// 模拟 Prisma 的嵌套过滤:文章按 type/status 过滤;内层 contentrelations 按相册分类 mid 过滤
// (photo 标记取过滤后的结果长度,故未配置相册分类时 mid:-1 命中不到 → false)
sharedFake.on("travels", "findMany", async () => travels.map(t => ({
  ...t,
  contenttravels: t.contenttravels.map(ct => ({
    content: {
      ...ct.content,
      contentrelations: ct.content.contentrelations.filter(r => r.mid === photoMid),
    },
  })),
})));

const changelogs = [
  { id: 1, content: JSON.stringify([{ type: "修复", value: "修了 bug" }]), create_time: new Date("2026-03-15T00:00:00Z") },
  { id: 2, content: JSON.stringify([{ type: "功能", value: "新功能" }]), create_time: new Date("2026-03-02T00:00:00Z") },
  { id: 3, content: JSON.stringify([{ type: "优化", value: "上月优化" }]), create_time: new Date("2026-02-20T00:00:00Z") },
];
sharedFake.on("changelogs", "findMany", async () => changelogs.map(c => ({ ...c })));

const travelsHandler = (await import("#server/api/mini/travels.get")).default;
const changelogsHandler = (await import("#server/api/mini/changelogs.get")).default;

function ev(peer: string) {
  return makeAuthEvent({ method: "GET", peer, headers: { host: "imqi1.com" } }).event;
}

beforeEach(() => {
  fakeDataEnabled = false;
  photoMid = 5;
});

describe("mini/travels", () => {
  test("返回足迹:封面绝对化、关联文章带 photo 标记(是否属相册分类)", async () => {
    const r = (await travelsHandler(ev("10.9.9.1"))) as unknown as {
      success: boolean;
      data: Array<{ id: number; cover: string; contents: Array<{ id: number; photo: boolean }> }>;
    };
    expect(r.success).toBe(true);
    expect(r.data).toHaveLength(2);
    expect(r.data[0]!.contents.map(c => ({ id: c.id, photo: c.photo }))).toEqual([
      { id: 1, photo: true },
      { id: 2, photo: false },
    ]);
    // 无封面 → 空串
    expect(r.data[1]!.cover).toBe("");
  });

  test("未配置相册分类时 photo 恒 false", async () => {
    photoMid = undefined;
    const r = (await travelsHandler(ev("10.9.9.2"))) as unknown as { data: Array<{ contents: Array<{ photo: boolean }> }> };
    expect(r.data[0]!.contents.every(c => !c.photo)).toBe(true);
  });

  test("审核模式:整体置空", async () => {
    fakeDataEnabled = true;
    const r = (await travelsHandler(ev("10.9.9.3"))) as unknown as { data: unknown[] };
    expect(r.data).toEqual([]);
  });
});

describe("mini/changelogs", () => {
  test("按年月分组、组内时间倒序、月份新者在前", async () => {
    const r = (await changelogsHandler(ev("10.9.9.4"))) as unknown as {
      success: boolean;
      data: Array<{ year: number; month: number; logs: Array<{ id: number; entries: unknown[] }> }>;
    };
    expect(r.success).toBe(true);
    expect(r.data).toHaveLength(2);
    expect(r.data[0]!.year).toBe(2026);
    expect(r.data[0]!.month).toBe(3);
    expect(r.data[0]!.logs.map(l => l.id)).toEqual([1, 2]);
    expect(r.data[1]!.month).toBe(2);
    expect(r.data[0]!.logs[0]!.entries).toHaveLength(1);
  });

  test("审核模式:整体置空", async () => {
    fakeDataEnabled = true;
    const r = (await changelogsHandler(ev("10.9.9.5"))) as unknown as { data: unknown[] };
    expect(r.data).toEqual([]);
  });
});
