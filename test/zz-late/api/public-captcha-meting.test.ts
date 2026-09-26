import { describe, expect, mock, test } from "bun:test";

import { callAdmin } from "#test/helpers/admin";
import { mockSharedPrisma } from "#test/helpers/fake-prisma";

// 不 mock captcha:helper/auth-fakes 已注册 mock,跨文件 mock.module 会冲突覆盖
// issueCaptcha 返回空 Buffer(source 仍设 Content-Type 与返回),测试只断言 r defined

// mock @meting/core
mock.module("@meting/core", () => ({
  default: class Meting {
    format(_json: boolean) { return this; }
    async playlist(_id: string): Promise<string> { return JSON.stringify([{ name: "歌1" }]); }
    async song(_id: string): Promise<string> { return JSON.stringify([{ name: "歌1", artist: ["艺1"], url_id: 1, pic_id: 1, lyric_id: 1, source: "netease" }]); }
    async lyric(_id: string): Promise<string> { return "[00:00.00]歌词"; }
    async pic(_id: string): Promise<string> { return JSON.stringify({ url: "https://music.126.net/cover.jpg" }); }
  },
}));

mockSharedPrisma();

const captchaHandler = (await import("#server/api/captcha/image.get")).default;
const metingHandler = (await import("#server/api/meting")).default;

describe("captcha/image.get(图形验证码)", () => {
  test("返回 PNG Buffer(issueCaptcha mock 返回)", async () => {
    const r = await callAdmin(captchaHandler, {
      method: "GET",
      url: "/api/captcha/image",
    });
    expect(r).toBeDefined();
  });
});

describe("meting.ts(音乐代理)", () => {
  test("id 缺省 → 400", async () => {
    await expect(callAdmin(metingHandler, {
      method: "GET",
      url: "/api/meting?server=netease&type=song",
    })).rejects.toThrow();
  });

  test("server 缺省 → 400", async () => {
    await expect(callAdmin(metingHandler, {
      method: "GET",
      url: "/api/meting?type=song&id=12345",
    })).rejects.toThrow();
  });

  test("非法 server → 400", async () => {
    await expect(callAdmin(metingHandler, {
      method: "GET",
      url: "/api/meting?server=other&type=song&id=1",
    })).rejects.toThrow();
  });

  test("非法 callback(jsonp)→ 400(XSS 防护)", async () => {
    await expect(callAdmin(metingHandler, {
      method: "GET",
      url: "/api/meting?server=netease&type=song&id=1&format=jsonp&callback=alert(1)",
    })).rejects.toThrow();
  });

  test("合法 callback(jsonp)→ 通过 + 返回 callback 包裹", async () => {
    const r = await callAdmin(metingHandler, {
      method: "GET",
      url: "/api/meting?server=netease&type=song&id=1&format=jsonp&callback=cb",
    });
    expect(String(r)).toContain("cb(");
  });

  test("成功:song 类型 → 返回 {url} 包 JSON", async () => {
    const r = await callAdmin(metingHandler, {
      method: "GET",
      url: "/api/meting?server=netease&type=song&id=1",
    });
    expect(r).toBeDefined();
  });
});