/**
 * 解析文章/页面封面数据
 *
 * 存储格式统一为 JSON 数组，例如：
 *   [{ "url": "/uploads/a.jpg", "title": "封面一" },
 *    { "url": "/uploads/b.jpg" }]
 *
 * 兼容历史数据中元素为纯字符串的情况：["/uploads/a.jpg", "/uploads/b.jpg"]
 *
 * 返回值统一归一化为 { url, desc } 形状（把 title 映射为 desc），
 * desc 永远为字符串（无则为空字符串）。
 * 解析失败或非数组时返回 []。
 */
export function parseCovers(
  raw: string | null | undefined,
): Array<{ url: string; desc: string }> {
  if (!raw) return [];

  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    return [];
  }

  if (!Array.isArray(parsed)) return [];

  return parsed
    .map((item: any) => {
      if (typeof item === "string") return { url: item, desc: "" };
      return {
        url: item.url ?? item.cover ?? "",
        desc: item.title ?? item.desc ?? "",
      };
    })
    .filter(item => item.url);
}
