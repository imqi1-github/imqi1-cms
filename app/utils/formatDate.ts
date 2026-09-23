/**
 * 相对时间格式化 —— 首页卡片、分类/标签列表、搜索、订阅、文章详情、后台评论共用。
 *
 * 三个层次按页面需要取用（别再各处手写一遍）：
 *   - formatAbsoluteDate：UTC 绝对日期（YYYY-MM-DD）。
 *   - formatRelativeTime：纯相对时间（刚刚 / N分钟前 / N小时前 / N天前 / N周前 / N个月前 / N年前）。
 *   - formatHydratedDate：水合前返回绝对日期、水合后返回相对时间 —— 两端首帧文本一致，
 *     否则 now 在 SSR 与客户端不同会让「1小时前 / 2小时前」这类文本直接 hydration mismatch。
 *
 * 注意：搜索页 / 订阅页的相对时间口径与这里不同（用「今天 / 昨天」而不是「N小时前」），
 * 它们只复用 formatAbsoluteDate，相对部分各自保留。
 */

/** UTC 绝对日期 YYYY-MM-DD：不随机器时区变化，SSR 与客户端两端一致 */
export function formatAbsoluteDate(date: string | Date): string {
  const d = typeof date === "string" ? new Date(date) : date;
  const y = d.getUTCFullYear();
  const m = String(d.getUTCMonth() + 1).padStart(2, "0");
  const day = String(d.getUTCDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

/** 纯相对时间：从「刚刚」到「N年前」，粒度到分钟 */
export function formatRelativeTime(date: string | Date): string {
  const d = typeof date === "string" ? new Date(date) : date;
  const now = new Date();
  const diff = now.getTime() - d.getTime();
  const seconds = Math.floor(diff / 1000);
  const minutes = Math.floor(seconds / 60);
  const hours = Math.floor(minutes / 60);
  const days = Math.floor(hours / 24);
  const weeks = Math.floor(days / 7);
  const months = Math.floor(days / 30);
  const years = Math.floor(days / 365);

  if (years > 0) return `${years}年前`;
  if (months > 0) return `${months}个月前`;
  if (weeks > 0) return `${weeks}周前`;
  if (days > 0) return `${days}天前`;
  if (hours > 0) return `${hours}小时前`;
  if (minutes > 0) return `${minutes}分钟前`;
  return "刚刚";
}

/** 水合前绝对日期、水合后相对时间（isHydrated 传调用方自己的 ref 值） */
export function formatHydratedDate(date: string | Date, isHydrated: boolean): string {
  return isHydrated ? formatRelativeTime(date) : formatAbsoluteDate(date);
}

/** 兼容既有调用方的名字：分类/标签列表页用的就是纯相对时间 */
export const formatDate = formatRelativeTime;
