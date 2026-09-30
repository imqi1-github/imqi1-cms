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

// ===== 真实 meting 路径:mock @meting/core =====
const songs = [
  { name: "歌曲甲", artist: ["歌手甲"], url_id: "1", pic_id: "1", lyric_id: "1" },
  { name: "下架歌", artist: "歌手乙", url_id: "2", pic_id: "2", lyric_id: "2" },
  { name: "无地址", artist: "丙", url_id: "", pic_id: "", lyric_id: "" },
];
const mediaHost = "https://m701.music.126.net";
mock.module("@meting/core", () => ({
  default: class {
    constructor(public server: string) {}
    format() {
      return this;
    }
    async playlist() {
      return JSON.stringify(songs);
    }
    async song() {
      return JSON.stringify([songs[0]]);
    }
    async url(id: string) {
      // id=2 返回非白名单域名 → 该首应被丢弃
      return JSON.stringify({ url: id === "2" ? "https://evil.example.com/a.mp3" : `${mediaHost}/a.mp3` });
    }
    async pic() {
      return JSON.stringify({ url: `${mediaHost}/p.jpg` });
    }
    async lyric() {
      return JSON.stringify({ lyric: "[00:00] 歌词" });
    }
  },
}));

describe("mini/music(真实 meting 路径)", () => {
  test("歌单:解析可播放歌曲,丢弃非白名单域名的曲目", async () => {
    const r = (await handler(ev("10.9.12.10", "?id=123&type=playlist"))) as unknown as {
      success: boolean; data: Record<string, unknown>; list: Array<Record<string, unknown>>;
    };
    expect(r.success).toBe(true);
    // 3 首里第 2 首域名不在白名单、第 3 首无 url → 只留第 1 首
    expect(r.list).toHaveLength(1);
    expect(r.list[0]).toMatchObject({ name: "歌曲甲", artist: "歌手甲", url: `${mediaHost}/a.mp3` });
    expect(r.data).toEqual(r.list[0]);
  });

  test("单曲:type=song 只取一首", async () => {
    const r = (await handler(ev("10.9.12.11", "?id=1&type=song"))) as unknown as { list: unknown[] };
    expect(r.list).toHaveLength(1);
  });

  test("歌单为空 → 404", async () => {
    mock.module("@meting/core", () => ({
      default: class {
        format() {
          return this;
        }
        async playlist() {
          return "[]";
        }
      },
    }));
    const { default: freshHandler } = await import("#server/api/mini/music.get");
    await expect(freshHandler(ev("10.9.12.12", "?id=1"))).rejects.toMatchObject({ statusCode: 404 });
  });
});
