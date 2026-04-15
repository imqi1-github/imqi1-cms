/**
 * 解析 User Agent 字符串，返回浏览器和操作系统信息
 */

export interface ParsedAgent {
  browser: string | null;
  os: string | null;
  browserIcon: string;
  osIcon: string;
}

// 浏览器映射
const browsers: Record<string, { name: string; icon: string }> = {
  'Edg': { name: 'Edge', icon: 'ri-edge-new-fill' },
  'Edge': { name: 'Edge', icon: 'ri-edge-new-fill' },
  'Chrome': { name: 'Chrome', icon: 'ri-chrome-fill' },
  'Firefox': { name: 'Firefox', icon: 'ri-firefox-fill' },
  'Safari': { name: 'Safari', icon: 'ri-safari-fill' },
  'MSIE': { name: 'IE', icon: 'ri-ie-fill' },
  'Trident': { name: 'IE', icon: 'ri-ie-fill' },
  'Opera': { name: 'Opera', icon: 'ri-opera-fill' },
  'MicroMessenger': { name: '微信', icon: 'ri-wechat-fill' },
  'Mini': { name: '小程序', icon: 'ri-mini-program-fill' },
  'QQBrowser': { name: 'QQ浏览器', icon: 'ri-qq-fill' },
  'UBrowser': { name: 'UC浏览器', icon: 'ri-browser-fill' },
};

// 操作系统映射
const osMap: Record<string, { name: string; icon: string }> = {
  'Windows NT': { name: 'Windows', icon: 'ri-windows-fill' },
  'Macintosh': { name: 'Mac', icon: 'ri-finder-fill' },
  'iPhone': { name: 'iOS', icon: 'ri-apple-fill' },
  'iPad': { name: 'iOS', icon: 'ri-apple-fill' },
  'iOS': { name: 'iOS', icon: 'ri-apple-fill' },
  'Linux': { name: 'Linux', icon: 'ant-design:linux-outlined' },
  'Android': { name: 'Android', icon: 'ri-android-fill' },
  'Ubuntu': { name: 'Ubuntu', icon: 'ri-ubuntu-fill' },
  'Debian': { name: 'Debian', icon: 'ri-coreos-fill' },
  'CentOS': { name: 'CentOS', icon: 'ri-coreos-fill' },
};

export function parseUserAgent(userAgent: string): ParsedAgent {
  let browser: string | null = null;
  let browserIcon: string = 'ri-computer-line';
  let os: string | null = null;
  let osIcon: string = 'ri-smartphone-line';

  if (!userAgent) {
    return { browser, os, browserIcon, osIcon };
  }

  // 解析浏览器
  for (const [key, value] of Object.entries(browsers)) {
    if (userAgent.includes(key)) {
      browser = value.name;
      browserIcon = value.icon;
      break;
    }
  }

  // 解析操作系统
  for (const [key, value] of Object.entries(osMap)) {
    if (userAgent.includes(key)) {
      os = value.name;
      osIcon = value.icon;
      break;
    }
  }

  // 如果没有识别到操作系统，尝试从其他特征判断
  if (!os) {
    if (userAgent.includes('like Mac') && userAgent.includes('KHTML')) {
      // iOS 设备通常有这样的特征
      os = 'iOS';
      osIcon = 'ri-apple-fill';
    }
  }

  return { browser, os, browserIcon, osIcon };
}
