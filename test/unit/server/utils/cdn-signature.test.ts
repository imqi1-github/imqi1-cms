// 腾讯云 API 3.0 签名（TC3-HMAC-SHA256）。
//
// 关键回归点：**派生密钥链每步都是 HMAC(key=上一步, msg=本步字符串)**。
// 曾把 kService/kSigning 的 key 与 message 写反 → 线上报 AuthFailure.SignatureFailure，
// 而"按文档独立重算"的交叉校验测不出来（两处写反了仍自洽）。
// 故此处用**官方 SDK 产出的 golden vector** 锁死（tencentcloud-sdk-nodejs-common/common/sign.js）。
import { describe, expect, test } from "bun:test";

import { signTencentCloudRequest } from "#server/utils/cdn/tencent-signature";

/** 官方 SDK 对这组固定输入的输出（假密钥，只用于回归比对） */
const SDK_GOLDEN =
  "TC3-HMAC-SHA256 Credential=AKIDEXAMPLE/2019-02-25/teo/tc3_request, " +
  "SignedHeaders=content-type;host, Signature=48302caee5594368a207e8caa36b2a5071051c6aaf8f5572eddc182284060ca1";

const baseRequest = {
  service: "teo",
  version: "2022-09-01",
  action: "CreatePurgeTask",
  host: "teo.tencentcloudapi.com",
  payload: { ZoneId: "zone-test", Type: "purge_url", Targets: ["https://example.com/"] },
  credential: { secretId: "AKIDEXAMPLE", secretKey: "EXAMPLEKEY1234567890EXAMPLE" },
  timestamp: 1551113065,
  includeActionHeader: false,
};

describe("腾讯云 TC3 签名", () => {
  test("与官方 SDK 的 golden vector 逐字节一致（派生链回归）", () => {
    const signed = signTencentCloudRequest(baseRequest);
    expect(signed.headers.Authorization).toBe(SDK_GOLDEN);
  });

  test("默认把 x-tc-action 纳入签名（防接口被顶替）", () => {
    const signed = signTencentCloudRequest({ ...baseRequest, includeActionHeader: undefined });
    expect(signed.headers.Authorization).toContain("SignedHeaders=content-type;host;x-tc-action");
    expect(signed.headers["X-TC-Action"]).toBe("CreatePurgeTask");
  });

  test("请求头齐备：Content-Type 与签名里的逐字一致（不一致会签名失败）", () => {
    const signed = signTencentCloudRequest(baseRequest);
    expect(signed.headers["Content-Type"]).toBe("application/json");
    expect(signed.headers.Authorization).toContain("content-type;host");
    expect(signed.url).toBe("https://teo.tencentcloudapi.com/");
    expect(signed.headers["X-TC-Timestamp"]).toBe("1551113065");
  });

  test("body 与参与哈希的 payload 序列化一致", () => {
    const signed = signTencentCloudRequest(baseRequest);
    expect(signed.body).toBe(JSON.stringify(baseRequest.payload));
  });

  test("不传 region 时不发 X-TC-Region", () => {
    const signed = signTencentCloudRequest(baseRequest);
    expect(signed.headers["X-TC-Region"]).toBeUndefined();
  });
});
