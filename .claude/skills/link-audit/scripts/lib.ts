/**
 * link-audit 公共工具：SSRF 安全抓取 / HTML 取文 / JSON 读写。
 *
 * 只用 node 内置能力（无第三方依赖），可直接 `bun` 运行；skill 可整体拷走复用。
 * SSRF 防护思路对齐 server/utils/urlGuard.ts：仅 http/https、解析后任一 IP 落私有段即拒、
 * 每次跳转重新校验（DNS rebinding 的 TOCTOU 窗口对本地审计工具可接受）。
 */
import { lookup } from "node:dns/promises";
import { mkdir } from "node:fs/promises";
import { isIP } from "node:net";

/** 抓取结果：失败时 error 有值，其余字段为 null。 */
export interface FetchResult {
  ok: boolean;
  status: number;
  finalUrl: string;
  text: string;
  contentType: string;
  error: string | null;
}

/** 判断 IP 是否落在私有/环回/链路本地/保留段。 */
export function isPrivateIp(ip: string): boolean {
  const v = isIP(ip);
  if (v === 4) {
    const parts = ip.split(".").map(Number);
    const [a, b] = parts;
    if (a === undefined || b === undefined) return false;
    if (a === 0 || a === 10 || a === 127) return true;
    if (a === 169 && b === 254) return true;
    if (a === 172 && b >= 16 && b <= 31) return true;
    if (a === 192 && b === 168) return true;
    if (a === 100 && b >= 64 && b <= 127) return true;
    if (a >= 224) return true;
    return false;
  }
  if (v === 6) {
    const lower = ip.toLowerCase();
    const mapped = lower.match(/(\d{1,3}(?:\.\d{1,3}){3})$/);
    if (mapped?.[1]) return isPrivateIp(mapped[1]);
    const ff = lower.match(/^::ffff:([0-9a-f:]+)$/);
    if (ff?.[1]) {
      const hex = ff[1].replace(/:/g, "");
      if (/^[0-9a-f]{1,8}$/.test(hex)) {
        const p = hex.padStart(8, "0");
        const hi = parseInt(p.slice(0, 4), 16);
        const lo = parseInt(p.slice(4), 16);
        return isPrivateIp(`${hi >>> 8}.${hi & 0xff}.${lo >>> 8}.${lo & 0xff}`);
      }
      return false;
    }
    const groups = lower.split("::");
    if (groups.length > 2) return false;
    const head = groups[0] ? groups[0].split(":") : [];
    const tail = groups[1] ? groups[1].split(":") : [];
    const missing = 8 - head.length - tail.length;
    if (missing < 0) return false;
    const parts = head.concat(new Array(missing).fill("0")).concat(tail).map(x => parseInt(x || "0", 16));
    if (parts.length !== 8) return false;
    const a = parts[0] ?? 0;
    const allZero = parts.every(x => x === 0);
    const loopback = !allZero && parts.slice(0, 7).every(x => x === 0) && parts[7] === 1;
    if (allZero || loopback) return true;
    if ((a & 0xffc0) === 0xfe80) return true;
    if ((a & 0xfe00) === 0xfc00) return true;
    return false;
  }
  return false;
}

/** 取注册域名（去 www / 端口），用于同站判定与去重。 */
export function domainOf(rawUrl: string): string | null {
  try {
    const u = new URL(/^https?:\/\//i.test(rawUrl) ? rawUrl : `https://${rawUrl}`);
    return u.hostname.toLowerCase().replace(/^www\./, "");
  } catch {
    return null;
  }
}

/** 校验 URL 可安全外联：协议 + 主机名变体 + DNS 解析结果。 */
async function assertPublicUrl(rawUrl: string): Promise<URL> {
  const url = new URL(rawUrl);
  if (url.protocol !== "http:" && url.protocol !== "https:") {
    throw new Error(`协议不支持：${url.protocol}`);
  }
  const hostname = url.hostname.replace(/^\[|\]$/g, "").toLowerCase();
  if (!hostname || hostname.length > 253) throw new Error("主机名非法");
  if (hostname === "localhost" || hostname.endsWith(".localhost") || hostname.endsWith(".localdomain")) {
    throw new Error("禁止访问内网地址");
  }
  if (isIP(hostname)) {
    if (isPrivateIp(hostname)) throw new Error("禁止访问内网地址");
    return url;
  }
  let addresses: Array<{ address: string }>;
  try {
    addresses = await lookup(hostname, { all: true });
  } catch {
    throw new Error(`域名解析失败：${hostname}`);
  }
  if (!addresses.length) throw new Error(`域名无解析结果：${hostname}`);
  if (addresses.some(a => isPrivateIp(a.address))) throw new Error("禁止访问内网地址");
  return url;
}

/** 按 Content-Type / meta charset 解码响应体（国内站仍有大量 GBK）。 */
function decodeBody(buf: Uint8Array, contentType: string, headText: string): string {
  let charset = /charset=["']?([\w-]+)/i.exec(contentType)?.[1]?.toLowerCase();
  if (!charset) {
    const head = headText.slice(0, 2048);
    charset = /<meta[^>]+charset=["']?([\w-]+)/i.exec(head)?.[1]?.toLowerCase();
  }
  const tryDecode = (label: string): string | null => {
    try {
      return new TextDecoder(label).decode(buf);
    } catch {
      return null;
    }
  };
  if (charset && charset !== "utf-8") {
    const decoded = tryDecode(charset);
    if (decoded) return decoded;
  }
  const utf8 = tryDecode("utf-8");
  if (utf8 && !utf8.includes("�")) return utf8;
  return tryDecode("gbk") ?? utf8 ?? "";
}

/**
 * SSRF 安全抓取：每跳重校验 + 手写跳转（manual），返回正文文本。
 * 站点不可达时返回 ok:false 与 error，不抛异常（批量扫描要继续跑）。
 */
export async function fetchText(
  rawUrl: string,
  options: { timeoutMs?: number; maxRedirects?: number; userAgent?: string } = {},
): Promise<FetchResult> {
  const timeoutMs = options.timeoutMs ?? 15000;
  const maxRedirects = options.maxRedirects ?? 5;
  const userAgent = options.userAgent ?? "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36";
  let current = rawUrl;

  for (let hop = 0; hop <= maxRedirects; hop++) {
    let url: URL;
    try {
      url = await assertPublicUrl(current);
    } catch (error) {
      return { ok: false, status: 0, finalUrl: current, text: "", contentType: "", error: error instanceof Error ? error.message : String(error) };
    }

    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeoutMs);
    try {
      const response = await fetch(url.href, {
        redirect: "manual",
        signal: controller.signal,
        headers: { "User-Agent": userAgent, Accept: "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8", "Accept-Language": "zh-CN,zh;q=0.9" },
      });
      const status = response.status;
      const location = response.headers.get("location");
      if (status >= 300 && status < 400 && location) {
        if (hop >= maxRedirects) {
          return { ok: false, status, finalUrl: url.href, text: "", contentType: "", error: `重定向超过 ${maxRedirects} 跳` };
        }
        let next: string;
        try {
          next = new URL(location, url.href).href;
        } catch {
          return { ok: false, status, finalUrl: url.href, text: "", contentType: "", error: "重定向地址非法" };
        }
        if (!/^https?:\/\//i.test(next)) {
          return { ok: false, status, finalUrl: url.href, text: "", contentType: "", error: "重定向到非 http(s) 协议" };
        }
        current = next;
        continue;
      }
      const contentType = response.headers.get("content-type") ?? "";
      const buf = new Uint8Array(await response.arrayBuffer());
      const text = decodeBody(buf, contentType, buf.slice(0, 2048).reduce((s, b) => s + String.fromCharCode(b), ""));
      return { ok: response.ok, status, finalUrl: url.href, text, contentType, error: response.ok ? null : `HTTP ${status}` };
    } catch (error) {
      const message = error instanceof Error ? (error.name === "AbortError" ? "请求超时" : error.message) : String(error);
      return { ok: false, status: 0, finalUrl: current, text: "", contentType: "", error: message };
    } finally {
      clearTimeout(timer);
    }
  }
  return { ok: false, status: 0, finalUrl: current, text: "", contentType: "", error: "重定向异常" };
}

/** HTML → 纯文本（去脚本/样式/标签，保留换行结构）。 */
export function stripHtml(html: string): string {
  return html
    .replace(/<!--[\s\S]*?-->/g, " ")
    .replace(/<(script|style|noscript|template|svg|iframe|head)[\s\S]*?<\/\1>/gi, " ")
    .replace(/<(br\s*\/?|\/p|\/div|\/li|\/tr|\/h[1-6]|\/section|\/article|\/blockquote)\s*>/gi, "\n")
    .replace(/<[^>]+>/g, " ")
    .replace(/&nbsp;/gi, " ")
    .replace(/&lt;/gi, "<")
    .replace(/&gt;/gi, ">")
    .replace(/&quot;/gi, "\"")
    .replace(/&#0?39;|&apos;/gi, "'")
    .replace(/&amp;/gi, "&")
    .replace(/&#(\d+);/g, (_m, code: string) => String.fromCodePoint(Number(code)))
    .replace(/[^\S\n]+/g, " ")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

/** 取页面标题（用于报告里描述「位置」）。 */
export function extractTitle(html: string): string {
  const m = /<title[^>]*>([\s\S]{0,300}?)<\/title>/i.exec(html);
  return m?.[1] ? stripHtml(m[1]).slice(0, 120) : "";
}

/** 抽取页面内同站链接（去重、限流）。 */
export function extractSameSiteLinks(html: string, baseUrl: string, limit: number): string[] {
  const baseDomain = domainOf(baseUrl);
  const found = new Set<string>();
  const re = /<a\b[^>]*href=["']([^"'#]+)["']/gi;
  let m: RegExpExecArray | null;
  while ((m = re.exec(html)) !== null) {
    const href = m[1];
    if (!href || /^(javascript:|mailto:|tel:|data:)/i.test(href)) continue;
    let abs: string;
    try {
      abs = new URL(href, baseUrl).href;
    } catch {
      continue;
    }
    const d = domainOf(abs);
    if (!d || d !== baseDomain) continue;
    const u = new URL(abs);
    if (u.pathname === "/" && !u.search) continue;
    found.add(abs);
    if (found.size >= limit * 3) break;
  }
  return [...found].slice(0, limit);
}

/** 抽取 iframe / meta refresh 目标（常见博彩导流手段）。 */
export function extractEmbeddedTargets(html: string): string[] {
  const out = new Set<string>();
  const iframeRe = /<iframe\b[^>]*src=["']([^"']+)["']/gi;
  let m: RegExpExecArray | null;
  while ((m = iframeRe.exec(html)) !== null) {
    if (m[1]) out.add(m[1]);
  }
  const refreshRe = /<meta[^>]+http-equiv=["']?refresh["']?[^>]*content=["'][^"']*url=([^"'>\s]+)/gi;
  while ((m = refreshRe.exec(html)) !== null) {
    if (m[1]) out.add(m[1]);
  }
  return [...out];
}

/** 判定某个 href 是否指向「别的站点」（站外）。 */
function isOffSite(href: string, baseDomain: string | null): boolean {
  if (!href || /^(javascript:|mailto:|tel:|data:|#)/i.test(href)) return false;
  const domain = domainOf(href);
  if (!domain) return false;
  if (!baseDomain) return false;
  return domain !== baseDomain;
}

/** 友链/导航类板块的标题特征（这些板块里列的是「其他站点」，不属于被审站点自己的内容）。 */
const FRIEND_SECTION_RE = /友链|友情链接|推友|朋友圈|博客圈|友链文章|链接墙|书签|邻居|导航站|推荐链接|网站导航/;

/**
 * 抹掉「被审站点页面上属于第三方/其他站点」的部分，只留它自己的原创内容。
 *
 * 审查范围约定：友链站点的**友链区、外链聚合、留言板**里的违规内容，是那些站点自己的责任，
 * 不该记到本站头上。故送审前先屏蔽：
 *   1. 站外链接条目（锚文本 + 其后紧跟的「| 描述」式条目文案）
 *   2. 友链/导航/朋友圈类板块（从该标题到下一个同级标题）
 *   3. 评论区/留言板（访客内容）
 *
 * 正则级 HTML 手术，边界不完美，但只影响送审文本、不影响站点本身。
 */
export function maskThirdParty(html: string, baseUrl: string): { html: string; offsiteLinks: number; friendSections: number; commentBlocks: number } {
  const baseDomain = domainOf(baseUrl);
  let offsiteLinks = 0;
  let friendSections = 0;
  let commentBlocks = 0;

  // 1) 评论区 / 留言板（访客内容）
  let masked = html.replace(
    /<(div|section|ul|ol|aside)\b[^>]*(?:id|class)=["'][^"']*(?:comment|respond|disqus|gitalk|valine|talk|留言|评论)[^"']*["'][^>]*>[\s\S]{0,8000}?<\/\1>/gi,
    () => {
      commentBlocks++;
      return "";
    },
  );

  // 2) 站外链接条目：锚本身 + 紧跟的条目文案（以分隔符开头，限长）
  masked = masked.replace(
    /<a\b([^>]*)>([\s\S]*?)<\/a>(\s*[|｜·、\-—:：]\s*[^<]{0,40})?/gi,
    (full, attrs: string, text: string, tail: string | undefined) => {
      const href = /href=["']([^"']+)["']/i.exec(attrs)?.[1];
      if (!isOffSite(href ?? "", baseDomain)) return full;
      offsiteLinks++;
      return tail ? "" : "";
    },
  );

  // 3) 友链/导航类板块：从该标题删到下一个同级或更高级标题
  const headingRe = /<h([1-6])\b[^>]*>([\s\S]{0,300}?)<\/h\1>/gi;
  const headings: Array<{ start: number; end: number; level: number; text: string }> = [];
  let m: RegExpExecArray | null;
  while ((m = headingRe.exec(masked)) !== null) {
    headings.push({ start: m.index, end: m.index + m[0].length, level: Number(m[1] ?? 6), text: m[2] ?? "" });
  }
  const cuts: Array<{ start: number; end: number }> = [];
  for (const [index, heading] of headings.entries()) {
    if (!FRIEND_SECTION_RE.test(heading.text)) continue;
    let end = masked.length;
    for (const next of headings.slice(index + 1)) {
      if (next.level <= heading.level) {
        end = next.start;
        break;
      }
    }
    end = Math.min(end, heading.end + 4000);
    cuts.push({ start: heading.start, end });
  }
  for (const cut of cuts.sort((a, b) => b.start - a.start)) {
    masked = masked.slice(0, cut.start) + masked.slice(cut.end);
    friendSections++;
  }

  return { html: masked, offsiteLinks, friendSections, commentBlocks };
}


/** 抽取页面指向的站外域名（外链面：友链互导 / 导流落地页的入口）。 */
export function extractOutboundDomains(html: string, baseUrl: string, limit: number): string[] {
  const baseDomain = domainOf(baseUrl);
  const found = new Set<string>();
  const re = /<a\b[^>]*href=["']([^"'#]+)["']/gi;
  let m: RegExpExecArray | null;
  while ((m = re.exec(html)) !== null) {
    const href = m[1];
    if (!href || /^(javascript:|mailto:|tel:|data:)/i.test(href)) continue;
    let abs: string;
    try {
      abs = new URL(href, baseUrl).href;
    } catch {
      continue;
    }
    const d = domainOf(abs);
    if (!d || d === baseDomain) continue;
    found.add(d);
  }
  return [...found].slice(0, limit);
}

/** 百度 conclusionType（官方）：1=合规 2=不合规 3=疑似 4=审核失败（技术性失败）。 */
export const BAIDU_CONCLUSION_TYPE = { compliant: 1, violation: 2, suspicious: 3, auditFailed: 4 } as const;

/** 严重度序：数值大小≠严重度 —— 4（审核失败）数值最大却只是技术失败，按数值取 max 会盖掉 2（不合规）导致漏判。 */
const SEVERITY_RANK: Record<number, number> = { 2: 5, 3: 4, 4: 3, 1: 1 };

export function baiduSeverityRank(conclusionType: number): number {
  return SEVERITY_RANK[conclusionType] ?? 0;
}

/** 取一组块里最差的那块（按严重度序，不按数值大小）。 */
export function pickWorstConclusion<T extends { conclusionType: number }>(blocks: T[]): T | null {
  let worst: T | null = null;
  for (const block of blocks) {
    if (worst === null || baiduSeverityRank(block.conclusionType) > baiduSeverityRank(worst.conclusionType)) {
      worst = block;
    }
  }
  return worst;
}

/** 是否存在没审成的块（百度返回「审核失败」或本地异常）。 */
export function hasAuditFailure(blocks: Array<{ conclusionType: number; error?: string | null }>): boolean {
  return blocks.some(b => b.conclusionType === BAIDU_CONCLUSION_TYPE.auditFailed || Boolean(b.error));
}

/** 读 JSON 文件。 */
export async function readJson<T>(path: string): Promise<T> {
  const file = Bun.file(path);
  if (!(await file.exists())) throw new Error(`文件不存在：${path}`);
  return (await file.json()) as T;
}

/** 写 JSON 文件（自动建目录）。 */
export async function writeJson(path: string, data: unknown): Promise<void> {
  const dir = path.replace(/[\\/][^\\/]+$/, "");
  if (dir && dir !== path) await mkdir(dir, { recursive: true });
  await Bun.write(path, `${JSON.stringify(data, null, 2)}\n`);
}

/** 写文本文件（自动建目录）。 */
export async function writeText(path: string, content: string): Promise<void> {
  const dir = path.replace(/[\\/][^\\/]+$/, "");
  if (dir && dir !== path) await mkdir(dir, { recursive: true });
  await Bun.write(path, content);
}

/** 并发执行任务，限制同时进行的数量。 */
export async function mapWithConcurrency<T, R>(
  items: T[],
  limit: number,
  worker: (item: T, index: number) => Promise<R>,
): Promise<R[]> {
  const results = new Array<R>(items.length);
  let cursor = 0;
  const runners = Array.from({ length: Math.min(limit, items.length) }, async () => {
    for (;;) {
      const index = cursor++;
      if (index >= items.length) return;
      results[index] = await worker(items[index] as T, index);
    }
  });
  await Promise.all(runners);
  return results;
}

/** 命令行参数解析：--key value / --flag。 */
export function parseArgs(argv: string[]): Record<string, string | boolean> {
  const out: Record<string, string | boolean> = {};
  for (let i = 0; i < argv.length; i++) {
    const token = argv[i];
    if (!token?.startsWith("--")) continue;
    const key = token.slice(2);
    const next = argv[i + 1];
    if (next !== undefined && !next.startsWith("--")) {
      out[key] = next;
      i++;
    } else {
      out[key] = true;
    }
  }
  return out;
}
