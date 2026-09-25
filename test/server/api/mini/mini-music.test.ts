import "#test/helpers/nitro-globals";

import { beforeEach, describe, expect, mock, test } from "bun:test";

import { makeAuthEvent } from "#test/helpers/auth-fakes";
import { mockSharedPrisma } from "#test/helpers/fake-prisma";

mockSharedPrisma();

let fakeDataEnabled = false;
const realMiniFake = await import("#server/utils/mini-fake-data");
mock.module("#server/utils/mini-fake-data", () => ({
  ...realMiniFake,
  isMiniFakeDataEnabled: () => fakeDataEnabled,
}));

const handler = (await import("#server/api/mini/music.get")).default;

function ev(peer: string, query: string) {
  return makeAuthEvent({ method: "GET", peer, url: `/api/mini/music${query}`, headers: { host: "imqi1.com" } }).event;
}

beforeEach(() => {
  fakeDataEnabled = false;
});

describe("mini/music(参数校验)", () => {
  test("缺 id → 400;不支持平台 → 400;不支持类型 → 400", async () => {
    await expect(handler(ev("10.9.12.1", ""))).rejects.toMatchObject({ statusCode: 400 });
    await expect(handler(ev("10.9.12.2", "?id=123&server=spotify"))).rejects.toMatchObject({ statusCode: 400 });
    await expect(handler(ev("10.9.12.3", "?id=123&type=album"))).rejects.toMatchObject({ statusCode: 400 });
  });

  test("审核模式:不打上游,返回占位与空列表", async () => {
    fakeDataEnabled = true;
    const r = (await handler(ev("10.9.12.4", "?id=123"))) as unknown as { success: boolean; list: unknown[] };
    expect(r.success).toBe(true);
    expect(r.list).toEqual([]);
  });
});
