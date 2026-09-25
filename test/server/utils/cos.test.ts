import "#test/helpers/nitro-globals";

import { createHash } from "node:crypto";

import { beforeEach, describe, expect, test } from "bun:test";

import { mockSharedPrisma, sharedFake } from "#test/helpers/fake-prisma";

mockSharedPrisma();

// COS 用全局 fetch,这里替换为可控实现
const g = globalThis as unknown as Record<string, unknown>;
const fetchCalls: Array<{ url: string; init: Record<string, unknown> }> = [];
let fetchResponse = { ok: true, status: 200, text: "{}" };
g.fetch = async (url: string, init: Record<string, unknown>) => {
  fetchCalls.push({ url, init });
  return {
    ok: fetchResponse.ok,
    status: fetchResponse.status,
    text: async () => fetchResponse.text,
  };
};

let settingsMap = new Map<string, string>();

beforeEach(() => {
  fetchCalls.length = 0;
  fetchResponse = { ok: true, status: 200, text: "{}" };
  settingsMap = new Map([
    ["cosSecretId", "AKIDxxxx"],
    ["cosSecretKey", "SECRETxxxx"],
    ["cosBucket", "bucket-1250000000"],
    ["cosRegion", "ap-shanghai"],
    ["cosSourceDomain", ""],
    ["cosCdnDomain", ""],
    ["cosImageSuffix", ""],
  ]);
  sharedFake.on("informations", "findMany", async ({ where }: { where?: { key?: { in: string[] } } }) => {
    const keys = where?.key?.in ?? [...settingsMap.keys()];
    return keys.filter(k => settingsMap.has(k)).map(k => ({ key: k, value: settingsMap.get(k)! }));
  });
});

const { validateCosConfig, uploadToCOS, deleteFromCOS } = await import("#server/utils/cos");

describe("cos/validateCosConfig", () => {
  test("配置齐全 → valid", async () => {
    expect(await validateCosConfig()).toEqual({ valid: true });
  });

  test("缺任一必填项 → 配置不完整", async () => {
    settingsMap.set("cosBucket", "");
    const r = await validateCosConfig();
    expect(r.valid).toBe(false);
    expect(r.error).toContain("不完整");
  });
});

describe("cos/uploadToCOS", () => {
  test("成功上传:PUT 到 bucket 域名、带正确签名头与 content-type", async () => {
    const buf = Buffer.from("hello-cos");
    const r = await uploadToCOS(buf, "imgs/a.png", "image/png");
    expect(r.success).toBe(true);
    const call = fetchCalls[0]!;
    expect(call.url).toContain("bucket-1250000000.cos.ap-shanghai.myqcloud.com");
    expect(call.init.method).toBe("PUT");

    const headers = call.init.headers as Record<string, string>;
    // 签名头:COS v5 的 q-sign-algorithm / q-ak / q-signature
    expect(headers["Authorization"]).toContain("q-sign-algorithm=sha1");
    expect(headers["Authorization"]).toContain("q-ak=AKIDxxxx");
    expect(headers["Content-Type"]).toBe("image/png");
    // content-md5 必须与内容一致(签名会签它)
    expect(headers["Content-MD5"]).toBe(createHash("md5").update(buf).digest("base64"));
    // Date/Host 是 fetch 禁设头,不应出现在签名头列表里
    expect(headers["Authorization"]).not.toContain("date=");
    expect(headers["Authorization"]).not.toContain("host=");
  });

  test("配置不完整 → 上传失败并给出原因", async () => {
    settingsMap.set("cosSecretKey", "");
    const r = await uploadToCOS(Buffer.from("x"), "a.png", "image/png");
    expect(r.success).toBe(false);
    expect(r.error).toBeTruthy();
  });

  test("上游非 2xx → 失败", async () => {
    fetchResponse = { ok: false, status: 403, text: "AccessDenied" };
    const r = await uploadToCOS(Buffer.from("x"), "a.png", "image/png");
    expect(r.success).toBe(false);
  });

  test("imageSuffix 会替换图片扩展名并同步 content-type", async () => {
    await uploadToCOS(Buffer.from("x"), "imgs/a.png", "image/png", "webp");
    expect(fetchCalls[0]!.url).toContain(".webp");
    expect((fetchCalls[0]!.init.headers as Record<string, string>)["Content-Type"]).toBe("image/webp");
  });
});

describe("cos/deleteFromCOS", () => {
  test("本地 /uploads/ 路径同样走 COS 删除(路径归一后发 DELETE)", async () => {
    await deleteFromCOS("/uploads/a.png");
    expect(fetchCalls).toHaveLength(1);
    expect(String(fetchCalls[0]!.url)).toContain("/uploads/a.png");
  });

  test("非 /uploads/ 路径 → 拒绝(不允许删除)", async () => {
    const r = await deleteFromCOS("https://bucket-1250000000.cos.ap-shanghai.myqcloud.com/imgs/a.png");
    expect(r.success).toBe(false);
    expect(fetchCalls).toHaveLength(0);
  });

  test("COS 域名 URL → 发起 DELETE", async () => {
    const url = "https://bucket-1250000000.cos.ap-shanghai.myqcloud.com/uploads/imgs/a.png";
    const r = await deleteFromCOS(url);
    expect(r.success).toBe(true);
    expect(fetchCalls[0]!.init.method).toBe("DELETE");
  });
});
