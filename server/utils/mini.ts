import { siteConfig } from "~~/site.config";
import { prisma } from "#server/utils/prisma";

/** 把站点内相对/绝对 url 补成绝对地址：生产用 CDN/站点根，开发用传入 origin。 */
export function toAbsoluteUrl(url: string, origin: string) {
  if (!url) return "";

  try {
    return new URL(url).href;
  } catch {
    const base = process.env.NODE_ENV === "production"
      ? siteConfig.cdnUrl || siteConfig.siteUrl
      : origin;

    return new URL(url.startsWith("/") ? url : `/${url}`, base).href;
  }
}

const minute = 60 * 1000;
const hour = 60 * minute;
const day = 24 * hour;
const week = 7 * day;
const month = 30 * day;
const year = 365 * day;

/** 相对时间文案（刚刚 / N 分钟前 …）。 */
export function formatRelativeTime(value: Date) {
  const diff = Date.now() - value.getTime();

  if (diff < minute) return "刚刚";
  if (diff < hour) return `${Math.floor(diff / minute)} 分钟前`;
  if (diff < day) return `${Math.floor(diff / hour)} 小时前`;
  if (diff < week) return `${Math.floor(diff / day)} 天前`;
  if (diff < month) return `${Math.floor(diff / week)} 周前`;
  if (diff < year) return `${Math.floor(diff / month)} 个月前`;

  return `${Math.floor(diff / year)} 年前`;
}

/** 解析图片分类 mid（默认 slug "shot"，需 type:"category" 判别，避免同 slug 的 tag 误命中）。 */
export async function getPhotoCategoryMid() {
  const photoCategorySlugInfo = await prisma.informations.findUnique({
    where: { key: "photoCategorySlug" },
    select: { value: true },
  });
  const photoCategorySlug = photoCategorySlugInfo?.value || "shot";

  const photoCategory = await prisma.metas.findFirst({
    where: { slug: photoCategorySlug, type: "category" },
    select: { mid: true },
  });

  return photoCategory?.mid;
}

/** 网易云等音乐 CDN 直链 http → https（防 CSP 混合内容拦截）。 */
export function toHttps(url: string): string {
  return url.replace(/^http:\/\//i, "https://");
}
