import { resolve4, resolve6 } from "node:dns/promises";
import { isIP } from "node:net";

import { prisma } from "#server/utils/prisma";
import { getIpLocation } from "#server/utils/qqwry";
import { resolveCity } from "#server/utils/ip-location";
import { CITY_COORDS, matchForeignCoord, type Coord } from "~~/shared/city-coords";
import type { Bucket, ResolvedPoint } from "#server/types/apis/blog-network";

/**
 * 博客网络聚合端点（/map「博客网络」tab）
 *
 * 把订阅源(subscribes) + 友链(links)的域名经 DNS 解析到服务器 IP，再用 qqwry 定位，
 * 以头像作为标记打在地图上。点击卡片区分来源：订阅 → /subscribes?source=<id>（SPA），
 * 友链 → 目标站点（新标签）。
 *
 * 合并：订阅与友链按**域名**去重，重复域名以订阅为准（订阅是作者自加，收集意愿更强）。
 * 坐标：DNS 取**全部 A/AAAA 记录**，逐个 geolocate、按坐标去重后全部打点（多机房 CDN 自然多 pin，
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
    // 用真正的 scheme 前缀判断：startsWith("http") 会把「httpbin.org」「HTTP://…」
    // 这类无协议的裸主机名误判为已带协议，随后 new URL 抛错把合法域名静默丢掉
    const u = new URL(/^https?:\/\//i.test(url) ? url : `https://${url}`);
    return u.hostname.toLowerCase().replace(/^www\./, "");
  } catch (error) {
    console.error(error);
    return null;
  }
}

// 单条 DNS 解析带超时兜底（系统 resolver 默认可能很久），超时返回 fallback
// 无论哪一方胜出都清掉未触发的 timer，避免在每个 IP 上积压无用的 setTimeout 回调
function withTimeout<T>(p: Promise<T>, ms: number, fallback: T): Promise<T> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  const timeout = new Promise<T>(resolve => {
    timer = setTimeout(() => resolve(fallback), ms);
  });
  return Promise.race([p, timeout]).finally(() => {
    if (timer) clearTimeout(timer);
  });
}

function uniqueValues(values: Array<string | null | undefined>): string[] {
  return [...new Set(values.map(v => (v || "").trim()).filter(Boolean))];
}

function simplifyRawLocation(raw: string): string {
  return raw
    .replace(/^中国[–—-]?/, "")
    .split(/[–—-]/)
    .map(p => p.trim())
    .filter(Boolean)
    .slice(0, 2)
    .join("-");
}

function formatServerLocation(
  info: { city: string | null; province: string | null; isDomestic: boolean; country: string },
  rawLocation: string,
): string {
  if (info.isDomestic) return info.city || info.province || simplifyRawLocation(rawLocation);
  return info.country || simplifyRawLocation(rawLocation);
}

function normalizeServerIsp(isp: string): string {
  const raw = isp.trim();
  if (!raw) return "";

  const rules: Array<[RegExp, string]> = [
    [/腾讯|Tencent|DNSPod/i, "腾讯云"],
    [/阿里|Alibaba|Aliyun/i, "阿里云"],
    [/华为|Huawei/i, "华为云"],
    [/百度|Baidu/i, "百度云"],
    [/火山|Volc/i, "火山引擎"],
    [/京东|JD/i, "京东云"],
    [/Cloudflare/i, "Cloudflare"],
    [/Amazon|AWS|CloudFront/i, "AWS"],
    [/Google/i, "Google Cloud"],
    [/Microsoft|Azure/i, "Azure"],
    [/Vercel/i, "Vercel"],
    [/Netlify/i, "Netlify"],
    [/GitHub/i, "GitHub Pages"],
    [/Fastly/i, "Fastly"],
    [/Akamai/i, "Akamai"],
    [/DigitalOcean/i, "DigitalOcean"],
    [/Linode/i, "Linode"],
    [/Vultr/i, "Vultr"],
    [/Hetzner/i, "Hetzner"],
    [/OVH/i, "OVH"],
    [/Oracle/i, "Oracle Cloud"],
    // 博客网络解析到运营商出口时，多半是站点启用了运营商 CDN 边缘节点。
    [/移动|China Mobile|CMNET|铁通/i, "移动CDN"],
    [/联通|China Unicom|网通/i, "联通CDN"],
    [/电信|China Telecom|Chinanet/i, "电信CDN"],
    [/广电|CBN/i, "广电CDN"],
  ];

  return rules.find(([pattern]) => pattern.test(raw))?.[1] || raw;
}

// IP → 坐标 + 桶分类（国内 city→province→；境外 country→FOREIGN_COORDS 子串匹配）
function coordForInfo(info: { city: string | null; province: string | null; isDomestic: boolean; country: string }): {
  coord: Coord | null;
  bucket: Bucket;
} {
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
async function resolveDomain(domain: string): Promise<{ points: ResolvedPoint[]; bucket: Bucket }> {
  // 域名本身是 IP 字面量时跳过 DNS 直接用作 IP
  let ips: string[];
  if (isIP(domain)) {
    ips = [domain];
  } else {
    const [v4, v6] = await Promise.all([
      withTimeout(
        resolve4(domain).catch(() => []),
        5000,
        [],
      ),
      withTimeout(
        resolve6(domain).catch(() => []),
        5000,
        [],
      ),
    ]);
    ips = [...new Set([...v4, ...v6])];
  }
  if (!ips.length) return { points: [], bucket: "unknown" };

  const byCoord = new Map<string, { coord: Coord; locations: Set<string>; isps: Set<string> }>();
  let overseas = false;
  for (const ip of ips) {
    const [info, ipInfo] = await Promise.all([resolveCity(ip), getIpLocation(ip)]);
    const { coord, bucket } = coordForInfo(info);
    if (bucket === "overseas") overseas = true;
    if (coord) {
      const key = `${coord[0]},${coord[1]}`;
      let entry = byCoord.get(key);
      if (!entry) {
        entry = { coord, locations: new Set<string>(), isps: new Set<string>() };
        byCoord.set(key, entry);
      }

      const location = formatServerLocation(info, ipInfo?.location || "");
      const isp = normalizeServerIsp(ipInfo?.isp || "");
      if (location) entry.locations.add(location);
      if (isp) entry.isps.add(isp);
    }
  }

  const points = [...byCoord.values()].map(p => ({
    coord: p.coord,
    locations: [...p.locations],
    isps: [...p.isps],
  }));
  if (!points.length) return { points: [], bucket: overseas ? "overseas" : "unknown" };
  return { points, bucket: "ok" };
}

export default defineEventHandler(async event => {
  // 站点解析（DNS + qqwry 地理定位）开销大且结果近似稳定，缓存 30 分钟摊薄成本、防滥用。
  setHeader(event, "Cache-Control", "public, max-age=1800, s-maxage=1800");
  const [subscribes, links] = await Promise.all([
    prisma.subscribes.findMany({ select: { id: true, url: true, name: true, avatar: true } }),
    prisma.links.findMany({ where: { enabled: true }, select: { id: true, link: true, name: true, avatar: true } }),
  ]);

  // 归一化 + 按域名去重，订阅优先
  const byDomain = new Map<string, { type: "subscribe" | "link"; id: number; name: string; avatar: string | null; url: string }>();
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
      const res = d ? await resolveDomain(d) : { points: [], bucket: "unknown" as Bucket };
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
    serverLocation: string | null;
    serverIsp: string | null;
  }> = [];
  let overseas = 0;
  let unknown = 0;
  let id = 0;

  for (const r of resolved) {
    if (r.bucket === "overseas") overseas++;
    else if (r.bucket === "unknown") unknown++;
    for (const point of r.points) {
      const [lng, lat] = point.coord;
      const locations = uniqueValues(point.locations);
      const isps = uniqueValues(point.isps);
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
        serverLocation: locations.length ? locations.join(" / ") : null,
        serverIsp: isps.length ? isps.join(" / ") : null,
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
