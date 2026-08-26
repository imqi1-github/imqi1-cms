import { lookup } from "node:dns/promises";
import { isIP } from "node:net";

/**
 * 补全链接协议：无 http(s):// 前缀时统一加 https://。
 * 用户填 "example.com" 若原样入库，前台 <a href> 会被当相对路径 → 跳到 /xxx/example.com 死链。
 */
export function ensureUrlProtocol(rawUrl: string): string {
  const trimmed = rawUrl.trim();
  if (!trimmed) return trimmed;
  if (/^https?:\/\//i.test(trimmed)) return trimmed;
  return `https://${trimmed}`;
}

// 展开 IPv6 为 8 组 16 位数字，便于按 CIDR 前缀判定。Node 的 WHATWG URL 会把 IPv4 映射地址
// 规范化成十六进制（如 ::ffff:a9fe:a9fe），旧实现只按点分十进制 / fe80 前缀匹配会漏判（SSRF 绕过）。
function expandIpv6(ip: string): number[] {
  const lower = ip.toLowerCase();
  const halves = lower.split("::");
  if (halves.length > 2) return [];
  const head = halves[0] ? halves[0].split(":") : [];
  const tail = halves.length === 2 && halves[1] ? halves[1].split(":") : [];
  const missing = 8 - head.length - tail.length;
  if (missing < 0) return [];
  const all = head.concat(Array(missing).fill("0")).concat(tail);
  if (all.length !== 8) return [];
  return all.map(g => parseInt(g || "0", 16));
}

// 判断一个 IP 是否落在私有/环回/链路本地/保留段——这些地址不应被服务端 fetch 触达（SSRF 防护）
// 导出供 safe-fetch 在「连接前二次校验已钉 IP」时复用（DNS rebinding 防护）
export function isPrivateIp(ip: string): boolean {
  const v = isIP(ip);
  if (v === 4) {
    const parts = ip.split(".").map(Number);
    const a = parts[0];
    const b = parts[1];
    // isIP===4 保证 4 段，严格模式下仍需收窄掉 undefined
    if (a === undefined || b === undefined) return false;
    if (a === 0) return true; // 0.0.0.0/8
    if (a === 10) return true; // 10.0.0.0/8
    if (a === 127) return true; // 环回 127.0.0.0/8
    if (a === 169 && b === 254) return true; // 链路本地 169.254.0.0/16（含云元数据 169.254.169.254）
    if (a === 172 && b >= 16 && b <= 31) return true; // 172.16.0.0/12
    if (a === 192 && b === 168) return true; // 192.168.0.0/16
    if (a === 100 && b >= 64 && b <= 127) return true; // 100.64.0.0/10 CGNAT
    if (a >= 224) return true; // 组播/保留
    return false;
  }
  if (v === 6) {
    const lower = ip.toLowerCase();
    // IPv4 映射/内嵌：::ffff:a.b.c.d（点分）或 ::ffff:xxxx:xxxx（Node 规范化十六进制）→ 复用 IPv4 判定
    const v4tail = lower.match(/(\d{1,3}(?:\.\d{1,3}){3})$/);
    if (v4tail) return isPrivateIp(v4tail[1]!);
    const ff = lower.match(/^::ffff:([0-9a-f:]+)$/);
    if (ff) {
      const hex = ff[1]!.replace(/:/g, "");
      if (/^[0-9a-f]{1,8}$/.test(hex)) {
        const p = hex.padStart(8, "0");
        const hi = parseInt(p.slice(0, 4), 16);
        const lo = parseInt(p.slice(4), 16);
        return isPrivateIp(`${hi >>> 8}.${hi & 0xff}.${lo >>> 8}.${lo & 0xff}`);
      }
      return false;
    }
    // 普通 IPv6：展开 8 组按前缀判定
    const parts = expandIpv6(lower);
    if (!parts || parts.length !== 8) return false;
    const a = parts[0] ?? 0;
    const allZero = parts.every(x => x === 0);
    const loopback = !allZero && parts.slice(0, 7).every(x => x === 0) && parts[7] === 1;
    if (allZero || loopback) return true; // :: 与 ::1
    if ((a & 0xffc0) === 0xfe80) return true; // 链路本地 fe80::/10（含 fe81...febf）
    if ((a & 0xfe00) === 0xfc00) return true; // 唯一本地 fc00::/7
    return false;
  }
  return false;
}

/**
 * 校验一个用户提供的 URL 可安全地由服务端发起请求（SSRF 防护）。
 * - 仅允许 http/https 协议
 * - 解析主机名对应的所有 IP，任一落在私有/环回/链路本地段即拒绝
 * 通过则返回规范化后的 URL 对象，否则抛出 400。
 */
export async function assertPublicHttpUrl(rawUrl: string): Promise<URL> {
  let url: URL;
  try {
    url = new URL(rawUrl);
  } catch {
    throw createError({ statusCode: 400, message: "无效的URL格式" });
  }

  if (url.protocol !== "http:" && url.protocol !== "https:") {
    throw createError({ statusCode: 400, message: "仅支持 http/https 链接" });
  }

  const hostname = url.hostname.replace(/^\[|\]$/g, ""); // 去掉 IPv6 字面量的方括号

  // 主机名本身就是 IP：直接判断
  if (isIP(hostname)) {
    if (isPrivateIp(hostname)) {
      throw createError({ statusCode: 400, message: "禁止访问内网地址" });
    }
    return url;
  }

  if (hostname.toLowerCase() === "localhost") {
    throw createError({ statusCode: 400, message: "禁止访问内网地址" });
  }

  // 域名：解析出所有地址，任一为私有段即拒绝（防 DNS 指向内网）
  let addresses: Array<{ address: string }>;
  try {
    addresses = await lookup(hostname, { all: true });
  } catch {
    throw createError({ statusCode: 400, message: "无法解析该域名" });
  }

  if (addresses.some(a => isPrivateIp(a.address))) {
    throw createError({ statusCode: 400, message: "禁止访问内网地址" });
  }

  return url;
}
