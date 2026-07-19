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

// 判断一个 IP 是否落在私有/环回/链路本地/保留段——这些地址不应被服务端 fetch 触达（SSRF 防护）
function isPrivateIp(ip: string): boolean {
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
    if (lower === "::1" || lower === "::") return true; // 环回/未指定
    if (lower.startsWith("fe80")) return true; // 链路本地
    if (lower.startsWith("fc") || lower.startsWith("fd")) return true; // 唯一本地地址 fc00::/7
    // IPv4 映射地址 ::ffff:a.b.c.d
    const mapped = lower.match(/::ffff:(\d+\.\d+\.\d+\.\d+)$/);
    if (mapped) return isPrivateIp(mapped[1]!);
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
