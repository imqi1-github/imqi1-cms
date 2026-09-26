import { describe, expect, mock, test } from "bun:test";

import { callAdmin } from "#test/helpers/admin";
import { mockSharedPrisma } from "#test/helpers/fake-prisma";

// mock @meting/core:返回固定歌单/歌曲数据
mock.module("@meting/core", () => ({
  default: class Meting {
    format(_json: boolean) { return this; }
    async song(_id: string): Promise<string> {
      return JSON.stringify([
        { name: "歌1", artist: ["艺1"], url_id: 1, pic_id: 1, lyric_id: 1 },
      ]);
    }
    async playlist(_id: string): Promise<string> {
      return JSON.stringify([
        { name: "歌1", artist: ["艺1"], url_id: 1, pic_id: 1, lyric_id: 1 },
        { name: "歌2", artist: ["艺2"], url_id: 2, pic_id: 2, lyric_id: 2 },
      ]);
    }
    async url(_id: number): Promise<string> {
      return JSON.stringify({ url: "https://music.126.net/song.mp3" });
    }
    async pic(_id: number): Promise<string> {
      return JSON.stringify({ url: "https://music.126.net/cover.jpg" });
    }
    async lyric(_id: number): Promise<string> {
      return JSON.stringify({ lyric: "[00:00.00]歌词" });
    }
  },
}));

mockSharedPrisma();

const musicHandler = (await import("#server/api/mini/music.get")).default;

describe("mini/music.get(小程序音乐接口)", () => {
  test("id 缺省 → 400", async () => {
    await expect(callAdmin(musicHandler, {
      method: "GET",
      url: "/api/mini/music?server=netease&type=song",
    })).rejects.toMatchObject({ statusCode: 400 });
  });

  test("id 非字符串 → 400", async () => {
    await expect(callAdmin(musicHandler, {
      method: "GET",
      url: "/api/mini/music?server=netease&type=song&id[0]=a&id[1]=b",
    })).rejects.toMatchObject({ statusCode: 400 });
  });

  test("非法 server → 400", async () => {
    await expect(callAdmin(musicHandler, {
      method: "GET",
      url: "/api/mini/music?server=other&type=song&id=1",
    })).rejects.toThrow(/不支持/);
  });

  test("非法 type → 400(仅支持 song/playlist)", async () => {
    await expect(callAdmin(musicHandler, {
      method: "GET",
      url: "/api/mini/music?server=netease&type=album&id=1",
    })).rejects.toThrow();
  });

  test("成功:歌单类型 → 返回 success.data + list", async () => {
    const r = await callAdmin(musicHandler, {
      method: "GET",
      url: "/api/mini/music?server=netease&type=playlist&id=test123",
    }) as { success: boolean, data: { name: string, url: string }, list: Array<{ name: string }> };
    expect(r.success).toBe(true);
    expect(typeof r.data.name).toBe("string");
    expect(Array.isArray(r.list)).toBe(true);
  });

  test("成功:单曲类型 → 返回 1 首", async () => {
    const r = await callAdmin(musicHandler, {
      method: "GET",
      url: "/api/mini/music?server=netease&type=song&id=test456",
    }) as { success: boolean, list: unknown[] };
    expect(r.success).toBe(true);
    expect(r.list.length).toBe(1);
  });
});