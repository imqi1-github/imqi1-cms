/**
 * 解析 User Agent 字符串，返回浏览器和操作系统信息（前端 + 服务端共用）。
 *
 * 公开评论接口不再向前端下发原始 User Agent，改由服务端预解析成展示用的
 * browser/os 图标信息，避免泄露访客的浏览器指纹。前端侧仅 admin 后台评论页
 * （app/pages/admin/comments.vue）需要展示，二者解析结果必须一致，所以放 shared/。
 *
 * 关键约定：
 * - browsers/osMap 顺序敏感：包含通用子串的键（Chrome/Safari/Firefox/Macintosh/Linux）
 *   必须放在更具体的键（MicroMessenger/QQBrowser/UBrowser/Mini/Edg/Edge/Android/iPhone/iPad）
 *   之后，否则先命中通用键 break，具体键永远走不到。
 * - matchesUserAgent 拆分独立 helper，方便顺序排列后只调一次。
 */

export interface ParsedAgent {
  browser: string | null;
  os: string | null;
  browserIcon: string;
  osIcon: string;
}

// 浏览器映射。顺序：先 Edges/微信系/小程序/QQ/UC 等具体键，再 Chrome/Firefox/Safari 等通用键。
const browsers: Record<string, { name: string; icon: string }> = {
  Edg: { name: "Edge", icon: "ri-edge-new-fill" },
  Edge: { name: "Edge", icon: "ri-edge-new-fill" },
  MicroMessenger: { name: "微信", icon: "ri-wechat-fill" },
  Mini: { name: "小程序", icon: "ri-mini-program-fill" },
  QQBrowser: { name: "QQ浏览器", icon: "ri-qq-fill" },
  UBrowser: { name: "UC浏览器", icon: "ri-browser-fill" },
  // 现代 Opera(Blink) UA 含 "OPR/" 而非 "Opera"，且同时含 "Chrome/"——OPR 必须排在 Chrome 之前
  OPR: { name: "Opera", icon: "ri-opera-fill" },
  Chrome: { name: "Chrome", icon: "ri-chrome-fill" },
  Firefox: { name: "Firefox", icon: "ri-firefox-fill" },
  Safari: { name: "Safari", icon: "ri-safari-fill" },
  MSIE: { name: "IE", icon: "ri-ie-fill" },
  Trident: { name: "IE", icon: "ri-ie-fill" },
  Opera: { name: "Opera", icon: "ri-opera-fill" },
};

// 操作系统映射。顺序：先 iPhone/iPad/Android 等具体键，再 Macintosh/Linux 等通用键。
const osMap: Record<string, { name: string; icon: string }> = {
  "Windows NT": { name: "Windows", icon: "ri-windows-fill" },
  iPhone: { name: "iOS", icon: "ri-apple-fill" },
  iPad: { name: "iOS", icon: "ri-apple-fill" },
  Android: { name: "Android", icon: "ri-android-fill" },
  Macintosh: { name: "Mac", icon: "ri-finder-fill" },
  // 具体发行版须排在通用 "Linux" 之前，否则被 includes("Linux") 先行命中成死代码
  Ubuntu: { name: "Ubuntu", icon: "ri-ubuntu-fill" },
  Debian: { name: "Debian", icon: "ri-coreos-fill" },
  CentOS: { name: "CentOS", icon: "ri-coreos-fill" },
  Linux: { name: "Linux", icon: "app-linux" },
};

function matchesUserAgent(
  userAgent: string,
  map: Record<string, { name: string; icon: string }>,
): { name: string; icon: string } | null {
  for (const [key, value] of Object.entries(map)) {
    if (userAgent.includes(key)) return value;
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

  const browser = matchesUserAgent(userAgent, browsers);
  let os = matchesUserAgent(userAgent, osMap);

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