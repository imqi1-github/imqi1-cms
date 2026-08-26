/**
 * 解析文章/页面封面数据
 *
 * 存储格式统一为 JSON 数组，例如：
 *   [{ "url": "/uploads/a.jpg", "title": "封面一" },
 *    { "url": "/uploads/b.jpg" }]
 *
 * 兼容历史数据中元素为纯字符串的情况：["/uploads/a.jpg", "/uploads/b.jpg"]
 *
 * 返回值统一归一化为 { url, desc, width, height } 形状（把 title 映射为 desc），
 * desc 永远为字符串（无则为空字符串）。
 * 解析失败或非数组时返回 []。
 */
import type { ParsedCover } from "#server/types/utils/covers";

const toNullableNumber = (value: unknown) => {
  return typeof value === "number" && Number.isFinite(value) ? value : null;
};

export function parseCovers(
  raw: string | null | undefined,
): ParsedCover[] {
  if (!raw) return [];

  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch (error) {
    console.error(error);
    return [];
  }

  if (!Array.isArray(parsed)) return [];

  return parsed
    .map((item: unknown) => {
      if (typeof item === "string") {
        return {
          url: item,
          desc: "",
          width: null,
          height: null,
        };
      }

      const obj = (item ?? {}) as Record<string, unknown>;
      return {
        url: (obj.url as string) || (obj.cover as string) || "",
        desc: (obj.title as string) || (obj.desc as string) || "",
        width: toNullableNumber(obj.width),
        height: toNullableNumber(obj.height),
      };
    })
    .filter(item => item.url);
}
