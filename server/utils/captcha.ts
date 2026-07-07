import { randomBytes } from "crypto";
import { readFileSync } from "fs";
import { createRequire } from "module";
import { dirname, join } from "path";
import { fileURLToPath } from "url";

import { getCookie, setCookie, type H3Event } from "h3";
import { initialize, svg2png } from "svg2png-wasm";

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

/**
 * 计算验证码字体候选路径（惰性调用，勿在模块顶层执行）。
 *
 * 打包后本模块被合并进 .output/server/chunks/_/nitro.mjs，Nitro 会把 import.meta.url
 * 替换为 globalThis._importMeta_.url——该值由入口 index.mjs 在**运行时**赋为真实 URL，
 * 但模块顶层代码在入口赋值前即执行，此时仍是占位符 "file:///_entry.js"，
 * fileURLToPath 会抛错。故必须在请求处理阶段（如 getCaptchaFont 内）才计算，
 * 那时 moduleDir 才是真实的 .output/server。
 *
 * 字体经构建复制到 .output/server/runtime-assets/DejaVuSans.ttf（源码 server/runtime-assets/）；
 * 末尾保留基于 cwd 的相对路径作兼容回退。
 */
function getCaptchaFontPaths(): string[] {
  const paths: string[] = [];
  try {
    const moduleDir = dirname(fileURLToPath(import.meta.url));
    paths.push(
      join(moduleDir, "runtime-assets", "DejaVuSans.ttf"),
      join(moduleDir, "..", "..", "runtime-assets", "DejaVuSans.ttf"),
      join(moduleDir, "..", "runtime-assets", "DejaVuSans.ttf"),
    );
  } catch {
    // import.meta.url 不可用时仅用相对路径
  }
  paths.push(
    join(process.cwd(), "server", "runtime-assets", "DejaVuSans.ttf"),
    "server/runtime-assets/DejaVuSans.ttf",
  );
  return paths;
}
let wasmReady: Promise<void> | null = null;
let captchaFont: Uint8Array | null | undefined;

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

/** 读取构建复制后的 WASM 文件；开发环境回退到 node_modules */
function readWasmFile(): Buffer {
  // 生产环境优先按模块自身位置定位，不依赖 process.cwd()。
  // 构建会把 wasm 复制到 .output/server/runtime-assets/svg2png_wasm_bg.wasm；
  // 打包后本模块位于 .output/server/chunks/_/*.mjs，故上溯两级即 server 根。
  // 用 nuxi preview（cwd=.output）或 node .output/server/index.mjs（cwd 任意）
  // 启动时，基于 cwd 的相对路径都会落空，绝对路径才稳定命中。
  try {
    const moduleDir = dirname(fileURLToPath(import.meta.url));
    const candidates = [
      join(moduleDir, "runtime-assets", "svg2png_wasm_bg.wasm"),
      join(moduleDir, "..", "..", "runtime-assets", "svg2png_wasm_bg.wasm"),
      join(moduleDir, "..", "runtime-assets", "svg2png_wasm_bg.wasm"),
    ];
    for (const candidate of candidates) {
      try {
        return readFileSync(candidate);
      } catch {
        // 尝试下一个候选路径
      }
    }
  } catch {
    // import.meta.url 不可用时继续走下方回退
  }

  // 兼容：基于 cwd 的相对路径（cwd 恰为 server 根时命中）。
  try {
    return readFileSync("runtime-assets/svg2png_wasm_bg.wasm");
  } catch {
    // 未找到属预期（开发环境无此产物），静默回退到下方 node_modules。
  }

  // 开发环境：通过包解析定位 node_modules 内的 wasm，不依赖当前工作目录。
  try {
    const require = createRequire(import.meta.url);
    return readFileSync(require.resolve("svg2png-wasm/svg2png_wasm_bg.wasm"));
  } catch {
    // 继续回退到相对路径。
  }

  try {
    return readFileSync("node_modules/svg2png-wasm/svg2png_wasm_bg.wasm");
  } catch {
    // 全部失败，抛出下方错误。
  }

  throw new Error("Cannot find svg2png WASM file. Expected runtime-assets/svg2png_wasm_bg.wasm in server root.");
}

/** 初始化 SVG 转 PNG 的 WASM 模块（只初始化一次） */
function ensureWasmReady(): Promise<void> {
  wasmReady ??= initialize(readWasmFile());
  return wasmReady;
}

/** 读取验证码字体，保证 SVG 文本在不同服务器上稳定渲染 */
function getCaptchaFont(): Uint8Array | undefined {
  if (captchaFont !== undefined) return captchaFont ?? undefined;

  // 惰性计算路径：此时已在请求处理阶段，import.meta.url 为真实值（见 getCaptchaFontPaths 注释）。
  const fontPaths = getCaptchaFontPaths();
  for (const path of fontPaths) {
    try {
      captchaFont = readFileSync(path);
      return captchaFont;
    } catch {
      // 兼容开发目录与 .output/server 运行目录，找不到则尝试下一个候选路径。
    }
  }

  // 所有候选路径均未命中：降级为不内嵌字体（svg2png 用默认字体族渲染）。
  console.warn("[captcha] 未找到验证码字体，回退默认字体:", fontPaths);
  captchaFont = null;
  return undefined;
}

/** 把 SVG 字符串栅格化为 PNG Buffer（位图化后无法用 XML 直接抠出明文答案） */
async function rasterizePng(svg: string): Promise<Buffer> {
  await ensureWasmReady();

  const font = getCaptchaFont();
  return Buffer.from(await svg2png(svg, {
    ...(font ? { fonts: [font] } : {}),
    defaultFontFamily: {
      monospaceFamily: "DejaVu Sans",
    },
  }));
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
export async function issueCaptcha(event: H3Event): Promise<Buffer> {
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
export function verifyCaptcha(event: H3Event, input: string): boolean {
  const token = getCookie(event, CAPTCHA_COOKIE);
  if (!token || !input) return false;

  const record = STORE.get(token);
  STORE.delete(token); // 一次性消费：防重放、防爆破

  if (!record) return false;
  if (Date.now() > record.expires) return false;

  return record.answer.toLowerCase() === input.trim().toLowerCase();
}
