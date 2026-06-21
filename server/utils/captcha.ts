import { randomBytes } from "crypto";
import { getCookie, setCookie } from "h3";
import sharp from "sharp";

/**
 * 图形验证码工具
 *
 * 设计要点：
 * - 答案只存在于服务端内存中，cookie 里只存一个不可逆的 token（key），
 *   机器人即使读取 Set-Cookie 也拿不到答案，必须 OCR 图片。
 * - 栅格化为 PNG 输出：SVG 仅作服务端中间产物，响应体是位图。
 *   早期直接返回 SVG 时，每个字符是明文 <text>，攻击者用 XML 解析即可
 *   零成本抠出答案（无需 OCR）；改为 PNG 位图后必须 OCR 才能破解。
 * - httpOnly cookie：前端 JS 也读不到 token。
 * - 一次性消费：无论校验成功/失败，验证后即从内存删除，防止重放/爆破。
 * - 内存存储：验证码是 5 分钟短生命周期数据，单实例内存 Map 足够且零依赖。
 *   若未来多实例部署，可迁移到 redis（见 server/utils/redis.ts）。
 */

const CAPTCHA_COOKIE = "captcha_token";
const TTL = 5 * 60 * 1000; // 5 分钟有效
const MAX_STORE = 5000; // 防 Map 无限增长
// 排除易混淆字符：0/O/o、1/I/i/l/L、2/Z/z
const CHARSET = "3456789abcdefghjkmnpqrstuvwxyABCDEFGHJKMNPQRSTUVWXY";
const LENGTH = 4;
// 在浅色背景上可见的颜色
const COLORS = ["#2563eb", "#dc2626", "#16a34a", "#d97706", "#7c3aed", "#db2777", "#0891b2"];

// 内存存储：token -> { answer, expires }
const STORE = new Map<string, { answer: string; expires: number }>();

/** 返回 [0, max) 的随机整数 */
function randomInt(max: number): number {
  const firstByte = randomBytes(1).at(0) ?? 0;
  return firstByte % max;
}

/** 生成长度为 LENGTH 的随机验证码文本（仅含不易混淆的字母数字） */
function randomText(): string {
  const bytes = randomBytes(LENGTH);
  let text = "";

  for (let i = 0; i < LENGTH; i++) {
    const byte = bytes.at(i) ?? 0;
    text += CHARSET.charAt(byte % CHARSET.length);
  }

  return text;
}

/** 转义 XML 特殊字符，避免 SVG 注入 */
function escapeXml(value: string): string {
  const entityMap: Record<string, string> = {
    "<": "&lt;",
    ">": "&gt;",
    "&": "&amp;",
    "'": "&apos;",
    '"': "&quot;",
  };

  return value.replace(/[<>&'"]/g, char => entityMap[char] || char);
}

/** 生成带干扰线、噪点、彩色旋转字符的 SVG 验证码图片 */
function buildSvg(text: string): string {
  const width = 130;
  const height = 44;

  const chars = text
    .split("")
    .map((char, index) => {
      const x = 20 + index * 28;
      const y = 30 + (randomInt(9) - 4);
      const rotation = randomInt(50) - 25;
      const color = COLORS[randomInt(COLORS.length)] || COLORS[0];
      const size = 24 + randomInt(7);

      return `<text x="${x}" y="${y}" font-size="${size}" fill="${color}" font-family="monospace" font-weight="bold" transform="rotate(${rotation} ${x} ${y})">${escapeXml(char)}</text>`;
    })
    .join("");

  let lines = "";
  for (let i = 0; i < 5; i++) {
    const x1 = randomInt(width);
    const y1 = randomInt(height);
    const x2 = randomInt(width);
    const y2 = randomInt(height);
    const color = COLORS[randomInt(COLORS.length)] || COLORS[0];
    lines += `<line x1="${x1}" y1="${y1}" x2="${x2}" y2="${y2}" stroke="${color}" stroke-width="1" opacity="0.5"/>`;
  }

  let dots = "";
  for (let i = 0; i < 40; i++) {
    const color = COLORS[randomInt(COLORS.length)] || COLORS[0];
    dots += `<circle cx="${randomInt(width)}" cy="${randomInt(height)}" r="1" fill="${color}" opacity="0.6"/>`;
  }

  return `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" viewBox="0 0 ${width} ${height}"><rect width="${width}" height="${height}" fill="#f8fafc" rx="4"/>${lines}${dots}${chars}</svg>`;
}

/** 把 SVG 字符串栅格化为 PNG Buffer（位图化后无法用 XML 直接抠出明文答案） */
async function rasterizePng(svg: string): Promise<Buffer> {
  return sharp(Buffer.from(svg)).png().toBuffer();
}

/** 清理过期项，防止内存无限增长 */
function cleanup() {
  if (STORE.size < MAX_STORE) return;

  const now = Date.now();
  for (const [token, record] of STORE) {
    if (now > record.expires) {
      STORE.delete(token);
    }
  }
}

/**
 * 签发一个新的验证码：生成答案、存内存、写 httpOnly cookie，返回 PNG Buffer（位图）。
 */
export async function issueCaptcha(event: any): Promise<Buffer> {
  cleanup();

  const answer = randomText();
  const token = randomBytes(16).toString("base64url");

  STORE.set(token, {
    answer,
    expires: Date.now() + TTL,
  });

  setCookie(event, CAPTCHA_COOKIE, token, {
    httpOnly: true,
    secure: import.meta.env.PROD,
    sameSite: "lax",
    maxAge: 60 * 5,
    path: "/",
  });

  return rasterizePng(buildSvg(answer));
}

/**
 * 校验验证码：一次性消费（无论成败都删除），大小写不敏感。
 * @returns 是否校验通过
 */
export function verifyCaptcha(event: any, input: string): boolean {
  const token = getCookie(event, CAPTCHA_COOKIE);
  if (!token || !input) return false;

  const record = STORE.get(token);
  STORE.delete(token); // 一次性消费：防重放、防爆破

  if (!record) return false;
  if (Date.now() > record.expires) return false;

  return record.answer.toLowerCase() === input.trim().toLowerCase();
}
