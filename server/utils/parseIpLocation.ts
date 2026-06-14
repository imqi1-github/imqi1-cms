/**
 * 解析 IP 地址，返回归属地和运营商信息
 */

export interface IpLocation {
  country: string | null;
  region: string | null;
  city: string | null;
  isp: string | null;
  location: string | null;
}

/**
 * 从 IP 查询 API 获取地理位置信息
 * 使用免费的 ip-api.com 服务（无需 API key）
 */
async function queryIpLocation(ip: string): Promise<IpLocation | null> {
  if (!ip || ip === "未知" || ip === "127.0.0.1") {
    return null;
  }

  try {
    // 使用 ip-api.com 的免费服务
    const response = await fetch(`http://ip-api.com/json/${ip}?lang=zh-CN`, {
      signal: AbortSignal.timeout(3000), // 3秒超时
    });

    if (!response.ok) {
      return null;
    }

    const data = await response.json();

    if (data.status !== "success") {
      return null;
    }

    // 提取运营商信息
    let isp: string | null = data.isp || null;
    if (isp) {
      // 简化运营商名称
      if (isp.includes("移动") || isp.includes("China Mobile")) {
        isp = "移动";
      } else if (isp.includes("联通") || isp.includes("China Unicom")) {
        isp = "联通";
      } else if (isp.includes("电信") || isp.includes("China Telecom")) {
        isp = "电信";
      } else {
        // 取第一个空格前的内容
        isp = isp.split(" ")[0] ?? null;
      }
    }

    // 组合位置信息（国家 + 地区 + 城市）
    const locationParts: string[] = [];
    if (data.country && data.country !== "中国") {
      locationParts.push(data.country);
    }
    if (data.regionName && data.regionName !== data.city) {
      locationParts.push(data.regionName);
    }
    if (data.city) {
      locationParts.push(data.city);
    }

    const location = locationParts.length > 0 ? locationParts.join(" ") : null;

    return {
      country: data.country || null,
      region: data.regionName || null,
      city: data.city || null,
      isp,
      location,
    };
  } catch (error) {
    console.error("查询 IP 位置失败:", error);
    return null;
  }
}

// 简单的内存缓存（避免重复查询同一 IP）
const ipCache = new Map<string, { data: IpLocation | null; timestamp: number }>();
const CACHE_TTL = 24 * 60 * 60 * 1000; // 24小时缓存

export async function parseIpLocation(ip: string): Promise<IpLocation> {
  if (!ip || ip === "未知") {
    return {
      country: null,
      region: null,
      city: null,
      isp: null,
      location: null,
    };
  }

  // 检查缓存
  const cached = ipCache.get(ip);
  if (cached && Date.now() - cached.timestamp < CACHE_TTL) {
    return cached.data || {
      country: null,
      region: null,
      city: null,
      isp: null,
      location: null,
    };
  }

  // 查询 IP 信息
  const result = await queryIpLocation(ip);

  // 更新缓存
  ipCache.set(ip, {
    data: result,
    timestamp: Date.now(),
  });

  return result || {
    country: null,
    region: null,
    city: null,
    isp: null,
    location: null,
  };
}
