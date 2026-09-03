import { createHmac, randomBytes, timingSafeEqual } from "crypto";

/**
 * 登录安全令牌：HMAC 签名 / 校验，用于两处：
 *  - 2FA 一次性 challenge（登录需第二因素时下发，5 分钟有效，绑定 uid）；
 *  - 「信任此设备」cookie（2FA 通过且勾选后下发，30 天有效，绑定 uid，此后同设备输对密码免 TOTP）。
 *
 * 签名密钥运行时从环境读取（不烘焙进构建产物，符合项目「敏感配置运行时化」约定）：
 *   优先 LOGIN_SECRET，其次复用 SSR_INTERNAL_REQUEST_SECRET，都为空则随机生成（重启失效，
 *   但 challenge 本就短生命周期；信任设备随机密钥会随重启失效，属安全兜底而非漏洞）。
 * 一律用密码学随机（randomBytes）与定长比较（timingSafeEqual），防预测与时序侧信道。
 */

let cachedSecret: string | null = null;
function getSecret(): string {
  if (cachedSecret !== null) return cachedSecret;
  cachedSecret =
    process.env.LOGIN_SECRET ||
    process.env.SSR_INTERNAL_REQUEST_SECRET ||
    randomBytes(32).toString("hex");
  return cachedSecret;
}

/** 对 payload 计算 HMAC-SHA256 签名（base64url） */
function sign(payload: string): string {
  return createHmac("sha256", getSecret()).update(payload).digest("base64url");
}

/** 生成 `payload.signature` 形式的令牌 */
function makeToken(obj: { uid: number; exp: number }): string {
  const payload = Buffer.from(JSON.stringify(obj)).toString("base64url");
  return `${payload}.${sign(payload)}`;
}

/** 解析并校验令牌：签名恒定时间比较 + 到期；返回 decode 后的对象或 null */
function decodeValidToken(token: string, now: number): { uid: number; exp: number } | null {
  const dot = token.lastIndexOf(".");
  if (dot <= 0) return null;
  const payload = token.slice(0, dot);
  const signature = token.slice(dot + 1);

  const expected = sign(payload);
  if (signature.length !== expected.length) return null;
  if (!timingSafeEqual(Buffer.from(signature, "utf8"), Buffer.from(expected, "utf8"))) return null;

  try {
    const obj = JSON.parse(Buffer.from(payload, "base64url").toString("utf8")) as { uid?: unknown; exp?: unknown };
    if (typeof obj.uid !== "number" || typeof obj.exp !== "number" || now > obj.exp) return null;
    return { uid: obj.uid, exp: obj.exp };
  } catch {
    return null;
  }
}

const CHALLENGE_TTL = 5 * 60 * 1000; // 5 分钟
const TRUSTED_DEVICE_TTL = 30 * 24 * 60 * 60 * 1000; // 30 天

/** 「信任此设备」cookie 名（login 读取、verify 设置，两端共用） */
export const TRUSTED_DEVICE_COOKIE = "trusted_device";

/** 签发 2FA challenge（登录密码校验通过、尚未建会话时） */
export function makeLoginChallenge(uid: number): string {
  return makeToken({ uid, exp: Date.now() + CHALLENGE_TTL });
}

/** 校验 challenge：通过返回绑定 uid，否则 null（用于 2FA 确认该给哪个用户建会话） */
export function verifyLoginChallenge(token: string): number | null {
  const obj = decodeValidToken(token, Date.now());
  return obj ? obj.uid : null;
}

/** 签发「信任此设备」令牌 */
export function makeTrustedDevice(uid: number): string {
  return makeToken({ uid, exp: Date.now() + TRUSTED_DEVICE_TTL });
}

export function verifyTrustedDevice(token: string, uid: number): boolean {
  const obj = decodeValidToken(token, Date.now());
  return obj !== null && obj.uid === uid;
}
