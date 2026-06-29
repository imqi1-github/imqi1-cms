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
  ip?: string;
  bitmask?: number;
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

function main() {
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

  for (const rawIp of args) {
    const ip = normalizeIp(rawIp);
    if (!isIP(ip)) {
      console.log(`${rawIp}\t无效 IP`);
      continue;
    }

    try {
      const result = ipdb.find(ip, { language: "CN" });
      if (result.code !== 0 || !result.data) {
        console.log(`${rawIp}\t未找到`);
        continue;
      }

      const data = result.data as IpdbData;
      const location = buildLocation(data);
      const isp = buildIsp(data);
      const range = data.ip && data.bitmask ? `${data.ip}/${data.bitmask}` : "";
      const suffix = range ? `\t${range}` : "";
      console.log(`${rawIp}\t${formatValue(location)}\t${formatValue(isp)}${suffix}`);
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      console.log(`${rawIp}\t查询失败: ${message}`);
    }
  }
}

try {
  main();
} catch (error) {
  console.error(error instanceof Error ? error.message : error);
  process.exitCode = 1;
}
