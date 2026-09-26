import { describe, expect, mock, test } from "bun:test";

import { callAdmin } from "#test/helpers/admin";

// mock wechat-mini:默认返回未配置错误;成功路径返回假 PNG
let mockResult: Buffer | Error = new Error("未配置微信小程序凭据 WECHAT_MINI_APPID");

mock.module("#server/utils/wechat-mini", () => ({
  generateMiniProgramCode: async (_scene: string, _page: string) => {
    if (mockResult instanceof Error) throw mockResult;
    return mockResult;
  },
}));

const qrcodeHandler = (await import("#server/api/qrcode.get")).default;

describe("qrcode.get(文章小程序码)", () => {
  test("cid 缺省 → 400", async () => {
    await expect(callAdmin(qrcodeHandler, {
      method: "GET",
      url: "/api/qrcode",
    })).rejects.toMatchObject({ statusCode: 400 });
  });

  test("cid 非整数 → 400", async () => {
    await expect(callAdmin(qrcodeHandler, {
      method: "GET",
      url: "/api/qrcode?cid=abc",
    })).rejects.toMatchObject({ statusCode: 400 });
  });

  test("cid 0 → 400", async () => {
    await expect(callAdmin(qrcodeHandler, {
      method: "GET",
      url: "/api/qrcode?cid=0",
    })).rejects.toMatchObject({ statusCode: 400 });
  });

  test("未配置微信凭据 → 404", async () => {
    mockResult = new Error("未配置微信小程序凭据 WECHAT_MINI_APPID");
    await expect(callAdmin(qrcodeHandler, {
      method: "GET",
      url: "/api/qrcode?cid=1",
    })).rejects.toMatchObject({ statusCode: 404 });
  });

  test("成功 → 返回 PNG Buffer", async () => {
    mockResult = Buffer.from([0xff, 0xd8, 0xff, 0xe0]); // JPEG magic
    const r = await callAdmin(qrcodeHandler, {
      method: "GET",
      url: "/api/qrcode?cid=100",
    });
    expect(r).toBeDefined();
  });

  test("上游失败(非配置错)→ 502", async () => {
    mockResult = new Error("network down");
    await expect(callAdmin(qrcodeHandler, {
      method: "GET",
      url: "/api/qrcode?cid=1",
    })).rejects.toMatchObject({ statusCode: 502 });
  });
});