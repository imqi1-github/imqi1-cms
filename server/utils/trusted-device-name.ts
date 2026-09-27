import { parseUserAgent } from "#shared/parseUserAgent";

/** 将原始设备名称转换为显示名称 */
export function resolveTrustedDeviceName(rawName: unknown, userAgent: string): string | null {
  const customName = typeof rawName === "string" ? rawName.trim().slice(0, 100) : "";
  if (customName) return customName;

  return parseUserAgent(userAgent).browser;
}
