/**
 * 文件体积格式化：`1.5 MB` / `512 B`；空值、0、非数字一律返回 `-`。
 *
 * 原先 5 个后台页面各写一份，且有 3 种行为（3 份只到 MB、1 份到 TB、仪表盘那份两位小数），
 * 现统一到「完整单位（B/KB/MB/GB/TB）+ 一位小数」；小于 1KB 不带小数，与多数原实现一致。
 */
export function formatFileSize(size: string | number | null | undefined): string {
  if (size === "-" || size === null || size === undefined || size === "") return "-";

  const bytes = Number(size);
  if (!Number.isFinite(bytes) || bytes <= 0) return "-";
  if (bytes < 1024) return `${bytes} B`;

  const units = ["KB", "MB", "GB", "TB"];
  let value = bytes / 1024;
  let i = 0;
  while (value >= 1024 && i < units.length - 1) {
    value /= 1024;
    i++;
  }
  return `${value.toFixed(1)} ${units[i]}`;
}
