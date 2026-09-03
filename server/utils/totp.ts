import { createHmac, randomBytes, timingSafeEqual } from "crypto";

/**
 * TOTP（RFC 6238）工具 —— 按 Google Authenticator 约定：HMAC-SHA1、6 位数字、30 秒步长。
 *
 * 自包含实现（只用 node:crypto），避免为单一算法引入 otplib/otpauth 等运行时依赖。
 * 用到的地方：
 *   - 后台启用两步验证：generateSecret() 生成 base32 密钥，otpauthUrl() 给认证器扫码/手动录入；
 *   - 登录第二因素校验：verifyTotp() 校验 6 位动态码（默认 ±1 步窗容忍时钟漂移）。
 *
 * 安全注意：
 *   - 密钥必须密码学随机（randomBytes），不能用 Math.random（可预测）。
 *   - 校验用固定窗口扫描，常量时间比较避免时序侧信道。
 */

const B32 = "ABCDEFGHIJKLMNOPQRSTUVWXYZ234567";
const BASE32_MAP: Record<string, number> = Object.fromEntries(
  B32.split("").map((ch, i) => [ch, i]),
);
const DIGITS = 6;
const PERIOD = 30; // 秒
const MAX_RECORD = 1_000_000; // 10^DIGITS
const WINDOW = 1; // 允许 ±1 步（共 3 个候选码）

/** Base32 编码（RFC 4648，无 '=' 填充，大写） */
function base32Encode(buf: Buffer): string {
  let bits = 0;
  let value = 0;
  let output = "";
  for (const byte of buf) {
    value = (value << 8) | byte;
    bits += 8;
    while (bits >= 5) {
      output += B32[(value >>> (bits - 5)) & 0x1f];
      bits -= 5;
    }
  }
  if (bits > 0) {
    output += B32[(value << (5 - bits)) & 0x1f];
  }
  return output;
}

/** Base32 解码（RFC 4648，容忍大小写、空格、'=' 填充） */
function base32Decode(input: string): Buffer {
  const cleaned = input.toUpperCase().replace(/[=\s]/g, "");
  let bits = 0;
  let value = 0;
  const out: number[] = [];
  for (const ch of cleaned) {
    const v = BASE32_MAP[ch];
    if (v === undefined) throw new Error("Invalid base32 character: " + ch);
    value = (value << 5) | v;
    bits += 5;
    if (bits >= 8) {
      out.push((value >>> (bits - 8)) & 0xff);
      bits -= 8;
    }
  }
  return Buffer.from(out);
}

/** 生成用于 TOTP 的随机密钥（20 字节 = 160 位 → 32 个 base32 字符，符合 RFC/GitHub/Google 推荐） */
export function generateTOTPSecret(): string {
  return base32Encode(randomBytes(20));
}

/** 把一个 unix 时间（秒）换算成 TOTP 计数器 */
function timeCounter(unixSeconds: number): number {
  return Math.floor(unixSeconds / PERIOD);
}

/** HMAC-SHA1 动态截断 → 6 位验证码（RFC 4226 HOTP 的动态截断 + RFC 6238 计数器） */
function totpCode(key: Buffer, counter: number): string {
  // 计数器为 8 字节大端
  const msg = Buffer.alloc(8);
  msg.writeBigUInt64BE(BigInt(counter));

  const hmac = createHmac("sha1", key).update(msg).digest();
  const offset = (hmac[hmac.length - 1] ?? 0) & 0x0f;
  // 取 4 字节，清最高位（防带符号溢出），再对 10^DIGITS 取模
  const code =
    (((hmac[offset] ?? 0) & 0x7f) << 24) |
    ((hmac[offset + 1] ?? 0) << 16) |
    ((hmac[offset + 2] ?? 0) << 8) |
    (hmac[offset + 3] ?? 0);
  return (code % MAX_RECORD).toString().padStart(DIGITS, "0");
}

/**
 * 校验用户输入的 6 位动态码。
 * @returns 是否通过（默认对当前 ±1 步的 3 个候选做常量时间比较）
 */
export function verifyTOTP(secret: string, token: string, now = Date.now()): boolean {
  const normalized = token.trim();
  if (!/^\d{6}$/.test(normalized)) return false;

  let key: Buffer;
  try {
    key = base32Decode(secret);
  } catch {
    return false;
  }

  const counter = timeCounter(Math.floor(now / 1000));
  for (let off = -WINDOW; off <= WINDOW; off++) {
    const candidate = totpCode(key, counter + off);
    // 定长比较防时序侧信道
    if (timingSafeStr(candidate, normalized)) return true;
  }
  return false;
}

function timingSafeStr(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  const ab = Buffer.from(a, "utf8");
  const bb = Buffer.from(b, "utf8");
  return timingSafeEqual(ab, bb);
}

/** 生成 otpauth:// URI，供认证器扫码或手动录入（issuer 与 account 单独编码，保留 `issuer:account` 分隔冒号，兼容各认证器） */
export function otpauthUrl(opts: { secret: string; account: string; issuer: string }): string {
  const label = `${encodeURIComponent(opts.issuer)}:${encodeURIComponent(opts.account)}`;
  const params = new URLSearchParams({
    secret: opts.secret,
    issuer: opts.issuer,
    algorithm: "SHA1",
    digits: String(DIGITS),
    period: String(PERIOD),
  });
  return `otpauth://totp/${label}?${params.toString()}`;
}
