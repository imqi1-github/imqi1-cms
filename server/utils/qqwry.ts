import { existsSync } from "fs";
import { dirname, join } from "path";
import { isIP } from "node:net";
import { fileURLToPath } from "url";

import IPDB from "ipdb";

import type { CachedLocation, IpdbData, IpDetail } from "#server/types/utils/qqwry";


const DB_FILE = "qqwry.ipdb";
const CACHE_TTL = 24 * 60 * 60 * 1000;
const MAX_CACHE = 20000;

let ipdbInstance: IPDB | null = null;
let dbDisabled = false;
const cache = new Map<string, CachedLocation>();

function normalizeIp(ip: string): string {
  const value = ip.trim();
  const mapped = value.match(/^::ffff:(\d{1,3}(?:\.\d{1,3}){3})$/i);
  return mapped?.[1] || value;
}

function getDbPaths(): string[] {
  const paths: string[] = [];
  if (process.env.QQWRY_IPDB_PATH) paths.push(process.env.QQWRY_IPDB_PATH);

  // 运行时资源统一放在 .output/server/runtime-assets/（源码在 server/runtime-assets/）。
  // `nuxi preview` 的 cwd 是 .output，cwd 相对路径会找不到，故优先用本模块所在目录推绝对路径。
  // 惰性计算：Nitro 把 import.meta.url 替换为运行时才赋真值的 globalThis._importMeta_.url，
  // 模块顶层执行时仍是占位符，必须在调用时（请求期）读取。
  try {
    const moduleDir = dirname(fileURLToPath(import.meta.url));
    paths.push(
      join(moduleDir, "runtime-assets", DB_FILE),
      join(moduleDir, "..", "runtime-assets", DB_FILE),
      join(moduleDir, "..", "..", "runtime-assets", DB_FILE),
    );
  } catch {
    // import.meta.url 尚为占位符（模块顶层执行）时忽略，走下方 cwd 回退
  }

  paths.push(
    join(process.cwd(), "server", "runtime-assets", DB_FILE),
    join(process.cwd(), "runtime-assets", DB_FILE),
  );
  return paths.filter(Boolean);
}

function resolveDbPath(): string | null {
  for (const path of getDbPaths()) {
    if (existsSync(path)) return path;
  }

  return null;
}

function getInstance(): IPDB | null {
  if (dbDisabled) return null;
  if (ipdbInstance) return ipdbInstance;

  const dbPath = resolveDbPath();
  if (!dbPath) {
    dbDisabled = true;
    return null;
  }

  try {
    ipdbInstance = new IPDB(dbPath);
    return ipdbInstance;
  } catch (error) {
    console.error(error);
    dbDisabled = true;
    return null;
  }
}

function getCached(ip: string): IpDetail | null | undefined {
  const cached = cache.get(ip);
  if (!cached) return undefined;

  if (Date.now() > cached.expires) {
    cache.delete(ip);
    return undefined;
  }

  cache.delete(ip);
  cache.set(ip, cached);
  return cached.value;
}

function setCached(ip: string, value: IpDetail | null) {
  if (cache.size >= MAX_CACHE) {
    const oldestKey = cache.keys().next().value;
    if (oldestKey) cache.delete(oldestKey);
  }

  cache.set(ip, {
    value,
    expires: Date.now() + CACHE_TTL,
  });
}

function normalizeChinaName(value: string): string {
  if (value === "中国台湾") return "台湾";
  if (value === "中国香港") return "香港";
  if (value === "中国澳门") return "澳门";
  return value;
}

function buildLocation(data: IpdbData): string {
  const country = normalizeChinaName(data.country_name || "");
  const region = normalizeChinaName(data.region_name || "");
  const city = normalizeChinaName(data.city_name || "");
  const district = normalizeChinaName(data.district_name || "");

  // 境内外拼接逻辑一致（原 if/else 两分支逐字相同，合并保留）
  return [country, region, city, district].filter(Boolean).join("-");
}

function buildIsp(data: IpdbData): string {
  return data.isp_domain || data.owner_domain || "";
}

function toDetail(data: IpdbData): IpDetail | null {
  const location = buildLocation(data);
  if (!location) return null;

  return {
    country: location,
    area: buildIsp(data),
    beginIP: data.ip || "",
    endIP: data.bitmask ? `${data.ip || ""}/${data.bitmask}` : "",
  };
}

/**
 * 查询 IP 归属地（qqwry.ipdb，支持 IPv4 / IPv6）
 */
export async function queryIpLocation(ip: string): Promise<IpDetail | null> {
  const normalizedIp = normalizeIp(ip);
  if (!isIP(normalizedIp)) return null;

  const cached = getCached(normalizedIp);
  if (cached !== undefined) return cached;

  try {
    const ipdb = getInstance();
    if (!ipdb) {
      setCached(normalizedIp, null);
      return null;
    }

    const result = ipdb.find(normalizedIp, { language: "CN" });
    const detail = result.code === 0 && result.data ? toDetail(result.data as IpdbData) : null;
    setCached(normalizedIp, detail);
    return detail;
  } catch (error) {
    console.error(error);
    setCached(normalizedIp, null);
    return null;
  }
}

/**
 * 获取 IP 的简洁位置信息 (只返回地区和运营商)
 */
export async function getIpLocation(ip: string): Promise<{
  location: string;
  isp: string;
} | null> {
  const detail = await queryIpLocation(ip);
  if (!detail) return null;

  return {
    location: detail.country || "",
    isp: detail.area || "",
  };
}
