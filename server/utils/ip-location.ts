/**
 * IP → 结构化地区解析（供「访客分布」聚合用）
 *
 * qqwry 的 `getIpLocation` 只返回字符串；评论页那个 `formatLocation`
 * （`server/api/comments/index.get.ts`）面向单条评论展示、返回单个字符串。
 * 访客分布需要**结构化**结果（区分省市、区分境内外）以便聚合 + 坐标匹配，
 * 故此处另建结构化解析器，评论页逻辑不动。
 *
 * 解析规则参考 `formatLocation`：去「中国」前缀、按 -/–/— 切分、取城市(parts[1])
 * 否则省份(parts[0])、去行政后缀。香港/澳门/台湾单列省份级（formatLocation 会把
 * 「香港特别行政区」压成「特区」造成歧义，这里直接保留省份级）。
 */

import { getIpLocation } from "#server/utils/qqwry";
import { CITY_COORDS, PROVINCES } from "~~/shared/city-coords";
import type { CityInfo } from "#server/types/utils/ip-location";

// 行政区划后缀，城市/省份名去掉后与内置坐标表 key 对齐
const ADMIN_SUFFIX = /(省|市|区|县|镇|乡|街道|地区|开发区|高新区|新区|新城|自治区|自治州|盟|旗)$/g;

function stripSuffix(s: string): string {
  return s.replace(ADMIN_SUFFIX, "");
}

/**
 * 解析单个 IP 的结构化地区。失败/解析不出时返回国内标记为 false、country 为空。
 * `getIpLocation` 基于 qqwry.ipdb，支持 IPv4 / IPv6。
 */
export async function resolveCity(ip: string): Promise<CityInfo> {
  const raw = (await getIpLocation(ip.trim()))?.location ?? "";
  if (!raw) return { city: null, province: null, isDomestic: false, country: "" };

  // 港澳台：qqwry 可能给「香港」「中国香港」「香港特别行政区」等，统一成省级
  if (raw.includes("香港")) return { city: null, province: "香港", isDomestic: true, country: "中国" };
  if (raw.includes("澳门")) return { city: null, province: "澳门", isDomestic: true, country: "中国" };
  if (raw.includes("台湾") || raw.includes("台北") || raw.includes("高雄") || raw.includes("新北")) {
    return { city: null, province: "台湾", isDomestic: true, country: "中国" };
  }

  // 简化版 ipdb 可能直接返回「南京」「重庆」「新疆」这类单字段。
  // 先按坐标表判断城市，再按省级判断；否则旧逻辑会把「南京」当作境外 country。
  const direct = stripSuffix(raw.replace(/^中国[–—-]?/, ""));
  if (direct && CITY_COORDS[direct]) {
    return {
      city: PROVINCES.has(direct) ? null : direct,
      province: PROVINCES.has(direct) ? direct : null,
      isDomestic: true,
      country: "中国",
    };
  }

  // 去「中国」前缀后按分隔符切分：典型「辽宁-沈阳-沈河区」或「辽宁省-沈阳市-沈河区」
  const loc = raw.replace(/^中国[–—-]?/, "");
  const parts = loc
    .split(/[–—-]/)
    .map(p => p.trim())
    .filter(Boolean);

  if (parts.length === 0) {
    // 既无中国前缀也切不出省级 → 视为境外
    return { city: null, province: null, isDomestic: false, country: raw };
  }

  const province = stripSuffix(parts[0] ?? "");
  // parts[0] 命中已知省级才算国内，否则当作境外（country 用原文）
  if (!PROVINCES.has(province)) {
    return { city: null, province: null, isDomestic: false, country: raw };
  }

  const city = parts.length >= 2 ? stripSuffix(parts[1] ?? "") || null : null;
  return { city, province, isDomestic: true, country: "中国" };
}
