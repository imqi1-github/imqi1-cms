/**
 * 解析 User Agent 字符串，返回浏览器和操作系统信息（前端 + 服务端共用）。
 *
 * 公开评论接口不再向前端下发原始 User Agent，改由服务端预解析成展示用的
 * browser/os 图标信息，避免泄露访客的浏览器指纹。前端侧仅 admin 后台评论页
 * （app/pages/admin/comments.vue）需要展示，二者解析结果必须一致，所以放 shared/。
 *
 * 关键约定：
 * - 浏览器/系统各自拆成「具体键 specific → 先匹配」+「通用键 generic → 后匹配」两档。
 *   具体 UA（MicroMessenger/QQBrowser/UBrowser/OPR/Android/Ubuntu…）必然先于子串更通用的
 *   键（Chrome/Safari/Firefox/Macintosh/Linux）命中，不再依赖对象插入顺序。
 *   此前两档混在一个有序对象里、靠插入顺序硬撑——新增条目放错位置就静默误判（顺序炸弹）。
 * - matchesUserAgent 拆分独立 helper，先 specific 后 generic 各调一次。
 */

export interface ParsedAgent {
  browser: string | null;
  os: string | null;
  browserIcon: string;
  osIcon: string;
}

// 浏览器「具体档」：这些键要么是唯一标识（微信/QQ/UC），要么是特定版本标记（OPR 之于 Blink Opera）。
// 必须排在 Chrome 等通用键之前命中，否则会被 UA 里同时包含的 "Chrome" 抢先。
const browserSpecific: Record<string, { name: string; icon: string }> = {
  Edg: { name: "Edge", icon: "ri-edge-new-fill" },
  Edge: { name: "Edge", icon: "ri-edge-new-fill" },
  MicroMessenger: { name: "微信", icon: "ri-wechat-fill" },
  QQBrowser: { name: "QQ浏览器", icon: "ri-qq-fill" },
  UBrowser: { name: "UC浏览器", icon: "ri-browser-fill" },
  // 现代 Opera(Blink) UA 含 "OPR/" 而非 "Opera"，且同时含 "Chrome/"——OPR 必须排在 Chrome 之前
  OPR: { name: "Opera", icon: "ri-opera-fill" },
  MSIE: { name: "IE", icon: "ri-ie-fill" },
  Trident: { name: "IE", icon: "ri-ie-fill" },
  Opera: { name: "Opera", icon: "ri-opera-fill" },
};

// 浏览器「通用档」：最后兜底。
const browserGeneric: Record<string, { name: string; icon: string }> = {
  Chrome: { name: "Chrome", icon: "ri-chrome-fill" },
  Firefox: { name: "Firefox", icon: "ri-firefox-fill" },
  Safari: { name: "Safari", icon: "ri-safari-fill" },
};

// 操作系统「具体档」
const osSpecific: Record<string, { name: string; icon: string }> = {
  "Windows NT": { name: "Windows", icon: "ri-windows-fill" },
  iPhone: { name: "iOS", icon: "ri-apple-fill" },
  iPad: { name: "iOS", icon: "ri-apple-fill" },
  Android: { name: "Android", icon: "ri-android-fill" },
  // 具体发行版放具体档，先于通用 "Linux" 命中（其 UA 同时含 "Linux"）
  Ubuntu: { name: "Ubuntu", icon: "ri-ubuntu-fill" },
  Debian: { name: "Debian", icon: "ri-coreos-fill" },
  CentOS: { name: "CentOS", icon: "ri-coreos-fill" },
};

// 操作系统「通用档」：最后兜底。
const osGeneric: Record<string, { name: string; icon: string }> = {
  Macintosh: { name: "Mac", icon: "ri-finder-fill" },
  Linux: { name: "Linux", icon: "app-linux" },
};

function matchesUserAgent(
  userAgent: string,
  ...maps: Array<Record<string, { name: string; icon: string }>>
): { name: string; icon: string } | null {
  for (const map of maps) {
    for (const [key, value] of Object.entries(map)) {
      if (userAgent.includes(key)) return value;
    }
  }
  return null;
}

export function parseUserAgent(userAgent: string): ParsedAgent {
  const browserFallback = "ri-computer-line";
  const osFallback = "ri-smartphone-line";

  if (!userAgent) {
    return { browser: null, os: null, browserIcon: browserFallback, osIcon: osFallback };
  }

  // 小程序评论：提交时 agent 统一记为 "Mini"（见 server/api/mini/comments.post.ts）。
  // 此处特判为「小程序 + 微信」双图标，与其它端的「浏览器 + 系统」语义对齐。
  if (userAgent === "Mini") {
    return {
      browser: "小程序",
      os: "微信",
      browserIcon: "ri-mini-program-fill",
      osIcon: "ri-wechat-fill",
    };
  }

  const browser = matchesUserAgent(userAgent, browserSpecific, browserGeneric);
  let os = matchesUserAgent(userAgent, osSpecific, osGeneric);

  // 如果没有识别到操作系统，尝试从其他特征判断（iOS 设备常带 like Mac + KHTML）
  if (!os && userAgent.includes("like Mac") && userAgent.includes("KHTML")) {
    os = { name: "iOS", icon: "ri-apple-fill" };
  }

  return {
    browser: browser?.name ?? null,
    os: os?.name ?? null,
    browserIcon: browser?.icon ?? browserFallback,
    osIcon: os?.icon ?? osFallback,
  };
}
