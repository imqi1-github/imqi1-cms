import { resolve4 } from "node:dns/promises";
import { prisma } from "#server/utils/prisma";
import { resolveCity } from "#server/utils/ip-location";
import { CITY_COORDS, matchForeignCoord, type Coord } from "~~/shared/city-coords";

/**
 * 博客网络聚合端点（/map「博客网络」tab）
 *
 * 把订阅源(subscribes) + 友链(links)的域名经 DNS 解析到服务器 IP，再用 qqwry 定位，
 * 以头像作为标记打在地图上。点击卡片区分来源：订阅 → /subscribes?source=<id>（SPA），
 * 友链 → 目标站点（新标签）。
 *
 * 合并：订阅与友链按**域名**去重，重复域名以订阅为准（订阅是作者自加，收集意愿更强）。
 * 坐标：DNS 取**全部 A 记录**，逐个 geolocate、按坐标去重后全部打点（多机房 CDN 自然多 pin，
 * 同机房合并）。国内 city→province 质心；境外 country→FOREIGN_COORDS 子串匹配；命中不了
 * 的计入 overseas / unknown 计数桶（不伪造坐标）。
 *
 * 隐私：DNS 仅 resolver 查询、不访问目标站点；**绝不返回**原始 IP。name / avatar / 目标 URL
 * 本就通过订阅页/友链页公开，可暴露。在线状态不采集。
 */

// 从 url/link 取注册域名（补协议、去端口、去 www. 前缀）作为去重键
function domainOf(url: string): string | null {
  if (!url) return null;
  try {
    const u = new URL(url.startsWith("http") ? url : `https://${url}`);
    return u.hostname.toLowerCase().replace(/^www\./, "");
  } catch {
    return null;
  }
}

const IPV4_RE = /^(?:\d{1,3}\.){3}\d{1,3}$/;

// 单条 DNS 解析带超时兜底（系统 resolver 默认可能很久），超时返回 fallback
function withTimeout<T>(p: Promise<T>, ms: number, fallback: T): Promise<T> {
  return Promise.race([p, new Promise<T>(r => setTimeout(() => r(fallback), ms))]);
}

type Bucket = "ok" | "overseas" | "unknown";

// IP → 坐标 + 桶分类（国内 city→province→；境外 country→FOREIGN_COORDS 子串匹配）
function coordForInfo(info: {
  city: string | null;
  province: string | null;
  isDomestic: boolean;
  country: string;
}): { coord: Coord | null; bucket: Bucket } {
  if (info.isDomestic) {
    const coord = (info.city && CITY_COORDS[info.city]) || (info.province && CITY_COORDS[info.province]) || null;
    // 国内按理总能命中省级质心；命中不到视为 unknown（不打点）
    return { coord, bucket: coord ? "ok" : "unknown" };
  }
  if (info.country) {
    const coord = matchForeignCoord(info.country);
    return { coord, bucket: coord ? "ok" : "overseas" };
  }
  return { coord: null, bucket: "unknown" };
}

// 一个域名 → 多个去重坐标 + 单一桶标记（任一 IP 命中即算定位成功，否则取最差的桶）
async function resolveDomain(domain: string): Promise<{ coords: Coord[]; bucket: Bucket }> {
  // 域名本身是 IPv4 字面量时跳过 DNS 直接用作 IP
  let ips: string[];
  if (IPV4_RE.test(domain)) {
    ips = [domain];
  } else {
    try {
      ips = await withTimeout(resolve4(domain), 5000, []);
    } catch {
      ips = [];
    }
  }
  if (!ips.length) return { coords: [], bucket: "unknown" };

  const seen = new Set<string>();
  const coords: Coord[] = [];
  let overseas = false;
  for (const ip of ips) {
    const info = await resolveCity(ip);
    const { coord, bucket } = coordForInfo(info);
    if (bucket === "overseas") overseas = true;
    if (coord) {
      const key = `${coord[0]},${coord[1]}`;
      if (!seen.has(key)) {
        seen.add(key);
        coords.push(coord);
      }
    }
  }
  if (!coords.length) return { coords: [], bucket: overseas ? "overseas" : "unknown" };
  return { coords, bucket: "ok" };
}

export default defineEventHandler(async () => {
  const [subscribes, links] = await Promise.all([
    prisma.subscribes.findMany({ select: { id: true, url: true, name: true, avatar: true } }),
    prisma.links.findMany({ where: { enabled: true }, select: { id: true, link: true, name: true, avatar: true } }),
  ]);

  // 归一化 + 按域名去重，订阅优先
  const byDomain = new Map<
    string,
    { type: "subscribe" | "link"; id: number; name: string; avatar: string | null; url: string }
  >();
  for (const s of subscribes) {
    const d = domainOf(s.url);
    if (!d) continue;
    if (!byDomain.has(d)) byDomain.set(d, { type: "subscribe", id: s.id, name: s.name, avatar: s.avatar, url: s.url });
  }
  for (const l of links) {
    const d = domainOf(l.link);
    if (!d) continue;
    if (!byDomain.has(d)) byDomain.set(d, { type: "link", id: l.id, name: l.name, avatar: l.avatar, url: l.link });
  }

  const blogs = [...byDomain.values()];

  // 并行解析所有域名
  const resolved = await Promise.all(
    blogs.map(async b => {
      const d = domainOf(b.url);
      const res = d ? await resolveDomain(d) : ({ coords: [], bucket: "unknown" as Bucket });
      return { blog: b, ...res };
    }),
  );

  const points: Array<{
    id: number;
    name: string;
    avatar: string | null;
    longitude: number;
    latitude: number;
    source: "subscribe" | "link";
    sourceId: number;
    targetUrl: string | null;
  }> = [];
  let overseas = 0;
  let unknown = 0;
  let id = 0;

  for (const r of resolved) {
    if (r.bucket === "overseas") overseas++;
    else if (r.bucket === "unknown") unknown++;
    for (const [lng, lat] of r.coords) {
      id++;
      points.push({
        id,
        name: r.blog.name,
        avatar: r.blog.avatar,
        longitude: lng,
        latitude: lat,
        source: r.blog.type,
        sourceId: r.blog.id,
        // 订阅卡片的跳转由 source+sourceId 拼 /subscribes?source=<id>，无需目标 URL；
        // 友链卡片直接开 targetUrl（外链）
        targetUrl: r.blog.type === "link" ? r.blog.url : null,
      });
    }
  }

  return {
    success: true,
    data: {
      points,
      overseas,
      unknown,
      total: blogs.length,
    },
  };
});
