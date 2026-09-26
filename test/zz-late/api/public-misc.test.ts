import "#test/helpers/nitro-globals";

import { describe, expect, mock, test } from "bun:test";

import { CSRF_COOKIE, CSRF_TOKEN, makeAuthEvent } from "#test/helpers/auth-fakes";
import { mockSharedPrisma } from "#test/helpers/fake-prisma";

mockSharedPrisma();

// ===== amap/config =====
const amapHandler = (await import("#server/api/amap/config")).default;

describe("amap/config", () => {
  test("代理模式:不下发密钥;直连模式:回 env 密钥;均 no-store", async () => {
    const g = globalThis as unknown as Record<string, unknown>;
    g.useRuntimeConfig = () => ({ amapUseServerProxy: true });
    const { event: e1, headers: h1 } = makeAuthEvent({ method: "GET", peer: "10.10.0.1" });
    const r1 = (await amapHandler(e1 as never)) as unknown as { key: string; securityCode: string };
    expect(r1).toEqual({ key: "", securityCode: "" });
    expect(h1["cache-control"]).toContain("no-store");

    process.env.AMAP_KEY = "ak-test";
    process.env.AMAP_SECURITY_CODE = "sc-test";
    g.useRuntimeConfig = () => ({ amapUseServerProxy: false });
    const { event: e2, headers: h2 } = makeAuthEvent({ method: "GET", peer: "10.10.0.2" });
    const r2 = (await amapHandler(e2 as never)) as unknown as { key: string; securityCode: string };
    expect(r2).toEqual({ key: "ak-test", securityCode: "sc-test" });
    expect(h2["cache-control"]).toContain("no-store");
    delete process.env.AMAP_KEY;
    delete process.env.AMAP_SECURITY_CODE;
    g.useRuntimeConfig = () => ({ redis: null, buildHash: "" });
  });
});

// ===== csrf/token =====
const csrfTokenHandler = (await import("#server/api/csrf/token.get")).default;

describe("csrf/token", () => {
  test("无 cookie:签发新 token 并下种;有 cookie:复用原 token", async () => {
    const { event: e1, setCookies } = makeAuthEvent({ method: "GET", peer: "10.10.1.1" });
    const r1 = (await csrfTokenHandler(e1 as never)) as unknown as { code: number; data: { token: string } };
    expect(r1.code).toBe(200);
    expect(r1.data.token).toBeTruthy();
    expect(setCookies.join(";")).toContain("csrf_token=");

    const { event: e2, setCookies: noNew } = makeAuthEvent({ method: "GET", peer: "10.10.1.2", cookie: CSRF_COOKIE });
    const r2 = (await csrfTokenHandler(e2 as never)) as unknown as { data: { token: string } };
    expect(r2.data.token).toBe(CSRF_TOKEN);
    expect(noNew.join(";")).not.toContain("csrf_token=");
  });
});

// ===== captcha/image =====
const captchaImageHandler = (await import("#server/api/captcha/image.get")).default;

describe("captcha/image", () => {
  test("返回 PNG 与 no-store 头(token 经 cookie 下发)", async () => {
    const { event, headers } = makeAuthEvent({ method: "GET", peer: "10.10.2.1" });
    const png = (await captchaImageHandler(event as never)) as unknown as Buffer;
    expect(Buffer.isBuffer(png)).toBe(true);
    expect(headers["content-type"]).toBe("image/png");
    expect(headers["cache-control"]).toContain("no-store");
  });
});

// ===== qr(通用二维码) =====
const qrHandler = (await import("#server/api/qr.get")).default;

describe("qr", () => {
  test("缺 text/空 text/超长/控制字符 → 400", async () => {
    for (const url of ["/api/qr", "/api/qr?text=%20%20", `/api/qr?text=${"x".repeat(1001)}`, "/api/qr?text=a%00b", "/api/qr?text=a%7Fb"]) {
      await expect(qrHandler(makeAuthEvent({ method: "GET", peer: "10.10.3.1", url }).event as never)).rejects.toMatchObject({ statusCode: 400 });
    }
  });

  test("合法 text → PNG buffer", async () => {
    const { event, headers } = makeAuthEvent({ method: "GET", peer: "10.10.3.2", url: `/api/qr?text=${encodeURIComponent("https://imqi1.com")}` });
    const png = (await qrHandler(event as never)) as unknown as Buffer;
    expect(Buffer.isBuffer(png)).toBe(true);
    expect(png.subarray(0, 4)).toEqual(Buffer.from([0x89, 0x50, 0x4e, 0x47]));
    expect(headers["content-type"]).toBe("image/png");
    expect(headers["cache-control"]).toBe("public, max-age=300");
  });
});

// ===== qrcode(小程序码) =====
let miniCodeResult: () => Promise<Buffer> = async () => Buffer.from("jpeg");
mock.module("#server/utils/wechat-mini", () => ({
  generateMiniProgramCode: async () => miniCodeResult(),
}));
const qrcodeHandler = (await import("#server/api/qrcode.get")).default;

describe("qrcode(小程序码)", () => {
  test("cid 非法 → 400;未配置凭据 → 404;上游异常 → 502", async () => {
    await expect(qrcodeHandler(makeAuthEvent({ method: "GET", peer: "10.10.4.1", url: "/api/qrcode?cid=abc" }).event as never)).rejects.toMatchObject({ statusCode: 400 });

    miniCodeResult = async () => {
      throw new Error("未配置微信小程序凭据(WECHAT_MINI_APPID/SECRET)");
    };
    await expect(qrcodeHandler(makeAuthEvent({ method: "GET", peer: "10.10.4.2", url: "/api/qrcode?cid=5" }).event as never)).rejects.toMatchObject({ statusCode: 404 });

    miniCodeResult = async () => {
      throw new Error("wx api down");
    };
    await expect(qrcodeHandler(makeAuthEvent({ method: "GET", peer: "10.10.4.3", url: "/api/qrcode?cid=5" }).event as never)).rejects.toMatchObject({ statusCode: 502 });
  });

  test("成功 → JPEG 字节流 + 短缓存", async () => {
    miniCodeResult = async () => Buffer.from("fakejpeg");
    const { event, headers } = makeAuthEvent({ method: "GET", peer: "10.10.4.4", url: "/api/qrcode?cid=5" });
    const buf = (await qrcodeHandler(event as never)) as unknown as Buffer;
    expect(buf.toString()).toBe("fakejpeg");
    expect(headers["content-type"]).toBe("image/jpeg");
    expect(headers["cache-control"]).toBe("public, max-age=300");
  });
});

// ===== check-link =====
type FetchCb = (res: { ok: boolean; status: number }) => unknown;
let checkLinkResult: (url: string, cb: FetchCb) => Promise<unknown> = async (_u, cb) => cb({ ok: true, status: 200 });
let checkLinkError: unknown = null;
mock.module("#server/utils/safe-fetch", () => ({
  fetchPublicUrl: async (url: string, cb: FetchCb) => {
    if (checkLinkError) throw checkLinkError;
    return checkLinkResult(url, cb);
  },
}));
const checkLinkHandler = (await import("#server/api/check-link.get")).default;

describe("check-link", () => {
  test("缺 url → 400", async () => {
    await expect(checkLinkHandler(makeAuthEvent({ method: "GET", peer: "10.10.5.1", url: "/api/check-link" }).event as never)).rejects.toMatchObject({ statusCode: 400 });
  });

  test("200 → up;非 2xx → down 带状态码;连接失败 → down 通用文案", async () => {
    const r1 = (await checkLinkHandler(makeAuthEvent({ method: "GET", peer: "10.10.5.2", url: "/api/check-link?url=https://a.com" }).event as never)) as unknown as { status: string; statusCode: number };
    expect(r1.status).toBe("up");
    expect(r1.statusCode).toBe(200);

    checkLinkResult = async (_u, cb) => cb({ ok: false, status: 503 });
    const r2 = (await checkLinkHandler(makeAuthEvent({ method: "GET", peer: "10.10.5.3", url: "/api/check-link?url=https://a.com" }).event as never)) as unknown as { status: string; message: string };
    expect(r2.status).toBe("down");
    expect(r2.message).toContain("503");

    checkLinkError = new Error("connect ECONNREFUSED");
    const r3 = (await checkLinkHandler(makeAuthEvent({ method: "GET", peer: "10.10.5.4", url: "/api/check-link?url=https://a.com" }).event as never)) as unknown as { status: string; message: string };
    expect(r3.status).toBe("down");
    expect(r3.message).toBe("链接不可访问");
  });

  test("SSRF 校验失败的 400 原样透传;超时 → down 请求超时", async () => {
    checkLinkError = Object.assign(new Error("private"), { statusCode: 400 });
    await expect(checkLinkHandler(makeAuthEvent({ method: "GET", peer: "10.10.5.5", url: "/api/check-link?url=http://127.0.0.1" }).event as never)).rejects.toMatchObject({ statusCode: 400 });

    checkLinkError = new DOMException("timeout", "AbortError");
    const r = (await checkLinkHandler(makeAuthEvent({ method: "GET", peer: "10.10.5.6", url: "/api/check-link?url=https://a.com" }).event as never)) as unknown as { status: string; message: string };
    expect(r).toEqual({ status: "down", message: "请求超时" });
    checkLinkError = null;
  });
});

// ===== meting(音乐代理) =====
let redirected: string | null = null;
const g = globalThis as unknown as Record<string, unknown>;
g.sendRedirect ??= (_event: unknown, url: string) => {
  redirected = url;
};

const metingSongs = [
  { name: "歌曲甲", artist: ["歌手甲", "歌手乙"], source: "netease", url_id: "u1", pic_id: "p1", lyric_id: "l1" },
  { name: "歌曲乙", artist: "单歌手", source: "netease", url_id: "u2", pic_id: "p2", lyric_id: "l2" },
];
mock.module("@meting/core", () => ({
  default: class {
    constructor(public server: string) {}
    format() {
      return this;
    }
    async playlist() {
      return JSON.stringify(metingSongs);
    }
    async song() {
      return JSON.stringify([metingSongs[0]]);
    }
    async url() {
      return JSON.stringify({ url: metingUrl });
    }
    async pic() {
      return JSON.stringify({ url: "http://p1.music.126.net/cover.jpg" });
    }
    async lyric() {
      return JSON.stringify({ lyric: "[00:00] 歌词行" });
    }
  },
}));
let metingUrl = "http://m701.music.126.net/song.mp3";

const metingHandler = (await import("#server/api/meting")).default;

describe("meting", () => {
  const call = (query: string, peer = "10.10.6.0") => metingHandler(makeAuthEvent({ method: "GET", peer, url: `/api/meting${query}` }).event as never) as Promise<unknown>;

  test("缺 id/server / 非法 server / 非法 callback → 400", async () => {
    await expect(call("?server=netease")).rejects.toMatchObject({ statusCode: 400 });
    await expect(call("?id=1")).rejects.toMatchObject({ statusCode: 400 });
    await expect(call("?id=1&server=spotify")).rejects.toMatchObject({ statusCode: 400 });
    await expect(call("?id=1&server=netease&format=jsonp&callback=1bad")).rejects.toMatchObject({ statusCode: 400 });
  });

  test("playlist:字段映射 artist 数组拼接与代理 url;JSONP 合法 callback", async () => {
    const r = (await call("?id=1&server=netease&type=playlist")) as unknown as Array<Record<string, string>>;
    expect(r).toHaveLength(2);
    expect(r[0]).toEqual({
      name: "歌曲甲",
      artist: "歌手甲/歌手乙",
      url: "/api/meting?server=netease&type=url&id=u1",
      pic: "/api/meting?server=netease&type=pic&id=p1",
      lrc: "/api/meting?server=netease&type=lrc&id=l1",
    });
    expect(r[1]!.artist).toBe("单歌手");

    const jsonp = (await call("?id=1&server=netease&type=playlist&format=jsonp&callback=ok_cb")) as unknown as string;
    expect(jsonp).toContain("ok_cb(");
    expect(jsonp).toContain("歌曲甲");
  });

  test("url/pic:白名单内重定向并升级 https;白名单外 → 400", async () => {
    await call("?id=u1&server=netease&type=url");
    expect(redirected).toBe("https://m701.music.126.net/song.mp3");
    await call("?id=p1&server=netease&type=pic");
    expect(redirected).toBe("https://p1.music.126.net/cover.jpg");

    metingUrl = "https://evil.example.com/a.mp3";
    await expect(call("?id=u1&server=netease&type=url")).rejects.toMatchObject({ statusCode: 400 });
    metingUrl = "http://m701.music.126.net/song.mp3";
  });

  test("lrc/name/artist:纯文本响应", async () => {
    const { event: e1, headers: h1 } = makeAuthEvent({ method: "GET", peer: "10.10.6.1", url: "/api/meting?id=1&server=netease&type=lrc" });
    const lyric = (await metingHandler(e1 as never)) as unknown as string;
    expect(lyric).toBe("[00:00] 歌词行");
    expect(h1["content-type"]).toContain("text/plain");

    const names = (await call("?id=1&server=netease&type=name")) as unknown as string;
    expect(names).toBe("歌曲甲");

    const { event: e2 } = makeAuthEvent({ method: "GET", peer: "10.10.6.2", url: "/api/meting?id=1&server=netease&type=artist" });
    const artists = (await metingHandler(e2 as never)) as unknown as string;
    expect(artists).toBe("歌手甲/歌手乙");
  });

  test("非法 type → 400;上游坏 JSON → 500", async () => {
    await expect(call("?id=1&server=netease&type=album")).rejects.toMatchObject({ statusCode: 400 });
  });
});
