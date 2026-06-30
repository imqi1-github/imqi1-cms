#!/usr/bin/env tsx
import { existsSync } from "node:fs";
import { isIP } from "node:net";
import { join } from "node:path";

import IPDBDefault from "ipdb";

const IPDB = typeof IPDBDefault === "function" ? IPDBDefault : (IPDBDefault as { default: typeof IPDBDefault }).default;
const DB_FILE = "qqwry.ipdb";

type IpdbData = {
  country_name?: string;
  region_name?: string;
  city_name?: string;
  district_name?: string;
  owner_domain?: string;
  isp_domain?: string;
};

function usage(): string {
  return `Usage:
  bun run get:ip 1.2.3.4 1.2.3.5

Options:
  --help, -h  Show this help.

Environment:
  QQWRY_IPDB_PATH  Override qqwry.ipdb path. Default: data/qqwry.ipdb
`;
}

function normalizeIp(ip: string): string {
  const value = ip.trim();
  const mapped = value.match(/^::ffff:(\d{1,3}(?:\.\d{1,3}){3})$/i);
  return mapped?.[1] || value;
}

function resolveDbPath(): string {
  const candidates = [
    process.env.QQWRY_IPDB_PATH || "",
    join(process.cwd(), "data", DB_FILE),
  ].filter(Boolean);

  const found = candidates.find(path => existsSync(path));
  if (!found) throw new Error(`qqwry.ipdb not found. Tried: ${candidates.join(", ")}`);
  return found;
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

  return [country, region, city, district].filter(Boolean).join("-");
}

function buildIsp(data: IpdbData): string {
  return data.isp_domain || data.owner_domain || "";
}

function formatValue(value: string): string {
  return value || "未知";
}

type ZxincResponse = {
  code: number;
  data?: {
    myip?: string;
    location?: string;
    country?: string;
    local?: string;
  };
};

async function fetchZxincLocation(ip: string): Promise<string> {
  const url = `https://ip.zxinc.org/api.php?type=json&ip=${encodeURIComponent(ip)}`;
  try {
    const response = await fetch(url);
    if (!response.ok) return `zxinc HTTP ${response.status}`;
    const json = (await response.json()) as ZxincResponse;
    if (json.code !== 0 || !json.data) return "zxinc 未找到";
    return json.data.location || json.data.country || "未知";
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    return `zxinc 查询失败: ${message}`;
  }
}

type IpResult = {
  rawIp: string;
  valid: boolean;
  localLocation: string;
  localIsp: string;
  localError: string;
  zxincLocation: string;
};

async function queryOne(ipdb: InstanceType<typeof IPDB>, rawIp: string): Promise<IpResult> {
  const ip = normalizeIp(rawIp);
  if (!isIP(ip)) {
    return { rawIp, valid: false, localLocation: "", localIsp: "", localError: "", zxincLocation: "" };
  }

  let localLocation = "未知";
  let localIsp = "";
  let localError = "";
  try {
    const result = ipdb.find(ip, { language: "CN" });
    if (result.code === 0 && result.data) {
      const data = result.data as IpdbData;
      localLocation = formatValue(buildLocation(data));
      localIsp = formatValue(buildIsp(data));
    } else {
      localLocation = "未找到";
    }
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    localError = `本地查询失败: ${message}`;
  }

  const zxincLocation = await fetchZxincLocation(ip);
  return { rawIp, valid: true, localLocation, localIsp, localError, zxincLocation };
}

function displayWidth(value: string): number {
  let width = 0;
  for (const ch of value) {
    const code = ch.codePointAt(0) ?? 0;
    // CJK / 全角字符按 2 列计算（简化判定：CJK 统一表意文字及常见全角区间）
    const wide = code >= 0x1100 && (
      code <= 0x115f
      || code >= 0x2e80 && code <= 0xa4cf
      || code >= 0xac00 && code <= 0xd7a3
      || code >= 0xf900 && code <= 0xfaff
      || code >= 0xfe30 && code <= 0xfe4f
      || code >= 0xff00 && code <= 0xff60
      || code >= 0xffe0 && code <= 0xffe6
      || code >= 0x20000 && code <= 0x2fffd
      || code >= 0x30000 && code <= 0x3fffd
    );
    width += wide ? 2 : 1;
  }
  return width;
}

function padRight(value: string, width: number): string {
  const w = displayWidth(value);
  return w >= width ? value : `${value}${" ".repeat(width - w)}`;
}

function renderResults(results: IpResult[]): void {
  const srcWidth = Math.max(displayWidth("[本地]"), displayWidth("[zxinc]")) + 2;
  const locWidth = Math.max(8, ...results
    .filter(r => r.valid && !r.localError)
    .map(r => displayWidth(r.localLocation))) + 2;

  for (const r of results) {
    console.log("─".repeat(srcWidth + locWidth + 28));
    console.log(`  ${r.rawIp}`);
    console.log("─".repeat(srcWidth + locWidth + 28));

    if (!r.valid) {
      console.log("  无效 IP");
      continue;
    }

    if (r.localError) {
      console.log(`  ${padRight("[本地]", srcWidth)}${r.localError}`);
    } else {
      console.log(`  ${padRight("[本地]", srcWidth)}${padRight(r.localLocation, locWidth)}${r.localIsp}`);
    }
    console.log(`  ${padRight("[zxinc]", srcWidth)}${r.zxincLocation}`);
  }
  console.log("─".repeat(srcWidth + locWidth + 28));
}

async function main() {
  const args = process.argv.slice(2);
  if (args.includes("--help") || args.includes("-h")) {
    console.log(usage());
    return;
  }

  if (!args.length) {
    console.error(usage());
    process.exitCode = 1;
    return;
  }

  const dbPath = resolveDbPath();
  const ipdb = new IPDB(dbPath);

  const results = await Promise.all(args.map(rawIp => queryOne(ipdb, rawIp)));
  renderResults(results);
}

try {
  main();
} catch (error) {
  console.error(error instanceof Error ? error.message : error);
  process.exitCode = 1;
}
