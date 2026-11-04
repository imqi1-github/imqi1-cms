/**
 * 腾讯云 API 3.0 签名（TC3-HMAC-SHA256）
 *
 * EdgeOne 属于腾讯云 API 网关，所有请求都要带 Authorization 签名。
 * 这份实现只依赖 node:crypto，POST + JSON body 是腾讯云 API 的通用形态。
 * 官方文档：https://cloud.tencent.com/document/api/1552/80725
 */

import { createHash, createHmac } from "node:crypto";

export interface TencentCloudCredential {
  /** 腾讯云 SecretId */
  secretId: string;
  /** 腾讯云 SecretKey */
  secretKey: string;
}

export interface TencentCloudApiRequest {
  /** 服务名，如 teo */
  service: string;
  /** 接口版本，如 2022-09-01 */
  version: string;
  /** 接口名，如 CreatePurgeTask */
  action: string;
  /** 请求主机，如 teo.tencentcloudapi.com */
  host: string;
  /** 地域，不传则不发 x-tc-region */
  region?: string;
  /** JSON 请求体 */
  payload: Record<string, unknown>;
  /** 签名凭证 */
  credential: TencentCloudCredential;
  /** 时间戳（秒），默认取当前时间；仅测试用 */
  timestamp?: number;
  /**
   * 是否把 x-tc-action 纳入签名（默认 true）。
   *
   * 关掉则与官方 SDK 逐字节一致，便于用官方产出的 golden vector 对拍（见单测）。
   */
  includeActionHeader?: boolean;
}

export interface SignedTencentCloudRequest {
  /** 完整请求 URL */
  url: string;
  /** 待发送的请求头（不含 Host，由 URL 自动推导） */
  headers: Record<string, string>;
  /** 请求体原文 */
  body: string;
}

const ALGORITHM = "TC3-HMAC-SHA256";
// 不带 charset：签名值必须与实际发出的头逐字一致，多写一个 charset 就会签名失败
const CONTENT_TYPE = "application/json";

function sha256Hex(data: string): string {
  return createHash("sha256").update(data, "utf8").digest("hex");
}

function hmacSha256(key: Buffer | string, data: string | Buffer): Buffer {
  return createHmac("sha256", key).update(data).digest();
}

/** UTC 日期（yyyy-mm-dd），签名里的 credential scope 用它 */
function utcDate(timestamp: number): string {
  return new Date(timestamp * 1000).toISOString().slice(0, 10);
}

/**
 * 生成腾讯云 API 3.0 签名请求
 *
 * 参与签名的头：content-type、host、x-tc-action（key 转小写按 ASCII 升序）。
 *
 * 派生密钥链三步，**每步都是 HMAC(key=上一步, msg=本步字符串)**：
 *   kDate    = HMAC("TC3"+SecretKey, Date)
 *   kService = HMAC(kDate, Service)
 *   kSigning = HMAC(kService, "tc3_request")
 *   签名     = HMAC(kSigning, StringToSign)
 * ⚠️ key/message 写反会得到 AuthFailure.SignatureFailure。官方文档的伪代码变量名有歧义，
 * 以官方 SDK（tencentcloud-sdk-nodejs-common/common/sign.js）为准；单测用官方 SDK 产出的
 * golden vector 锁死，见 test/unit/server/utils/cdn-signature.test.ts。
 */
export function signTencentCloudRequest(req: TencentCloudApiRequest): SignedTencentCloudRequest {
  const timestamp = req.timestamp ?? Math.floor(Date.now() / 1000);
  const date = utcDate(timestamp);
  const body = JSON.stringify(req.payload);
  const withAction = req.includeActionHeader !== false;
  const signedHeaders = withAction ? "content-type;host;x-tc-action" : "content-type;host";
  const credentialScope = `${date}/${req.service}/tc3_request`;

  // CanonicalHeaders 末尾必须有换行
  const canonicalHeaders =
    `content-type:${CONTENT_TYPE}\nhost:${req.host}\n` + (withAction ? `x-tc-action:${req.action.toLowerCase()}\n` : "");
  const canonicalRequest = ["POST", "/", "", canonicalHeaders, signedHeaders, sha256Hex(body)].join("\n");

  const stringToSign = [ALGORITHM, timestamp, credentialScope, sha256Hex(canonicalRequest)].join("\n");

  const kDate = hmacSha256(`TC3${req.credential.secretKey}`, date);
  const kService = hmacSha256(kDate, req.service);
  const kSigning = hmacSha256(kService, "tc3_request");
  const signature = hmacSha256(kSigning, stringToSign).toString("hex");

  const headers: Record<string, string> = {
    Authorization: `${ALGORITHM} Credential=${req.credential.secretId}/${credentialScope}, SignedHeaders=${signedHeaders}, Signature=${signature}`,
    "Content-Type": CONTENT_TYPE,
    "X-TC-Action": req.action,
    "X-TC-Version": req.version,
    "X-TC-Timestamp": String(timestamp),
  };
  if (req.region) headers["X-TC-Region"] = req.region;

  return {
    url: `https://${req.host}/`,
    headers,
    body,
  };
}
