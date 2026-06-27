/**
 * 更新日志 content 字段的解析 / 渲染 / 序列化
 *
 * content 在 DB 里是 TEXT，存的是 JSON 字符串：
 *   [{ "type": "功能"|"优化"|..., "value": "..." }, ...]
 *
 * 对外（API 响应）的条目带 html：{ type, value, html }，html 由 renderSimpleMarkdown 渲染。
 */
import { renderSimpleMarkdown } from "#server/utils/markdown";
import {
  isChangelogType,
  type ChangelogEntry,
  type ChangelogType,
} from "~~/shared/changelog";

/** 带渲染结果的对外条目 */
export interface RenderedChangelogEntry {
  type: ChangelogType;
  value: string;
  html: string;
}

/**
 * 把任意输入规整为干净的条目数组（用于入库前）。
 * 接受：JSON 字符串、条目数组、或不合法值。
 * type 非法回退「其他」，value 转字符串。
 */
export function normalizeChangelogEntries(input: unknown): ChangelogEntry[] {
  if (typeof input === "string") {
    return parseChangelogContent(input);
  }
  if (!Array.isArray(input)) {
    return [];
  }
  const entries: ChangelogEntry[] = input
    .map(item => {
      if (!item || typeof item !== "object") return null;
      const obj = item as Record<string, unknown>;
      const type = isChangelogType(obj.type) ? obj.type : "其他";
      const value = typeof obj.value === "string" ? obj.value : String(obj.value ?? "");
      return { type, value } as ChangelogEntry;
    })
    .filter((e): e is ChangelogEntry => e !== null);
  return entries;
}

/**
 * 解析 content 文本为条目数组。
 * - 合法 JSON 数组 → 规整为 { type, value }，type 非法时回退「其他」，value 转字符串。
 * - 非法 JSON / 非数组 / 空字符串 → 回退为单条 [{ type: "其他", value: 原文 }]（兼容脏数据）。
 */
export function parseChangelogContent(raw: string | null | undefined): ChangelogEntry[] {
  if (!raw || !raw.trim()) {
    return [];
  }

  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch (error) {
    console.error(error);
    // 非法 JSON：当作单段旧 desc 文本
    return [{ type: "其他", value: raw }];
  }

  if (!Array.isArray(parsed)) {
    // 非 JSON 数组（可能是迁移前的纯文本）：当作单条
    return [{ type: "其他", value: typeof parsed === "string" ? parsed : raw }];
  }

  const entries: ChangelogEntry[] = parsed
    .map(item => {
      if (!item || typeof item !== "object") return null;
      const obj = item as Record<string, unknown>;
      const type = isChangelogType(obj.type) ? obj.type : "其他";
      const value = typeof obj.value === "string" ? obj.value : String(obj.value ?? "");
      return { type, value } as ChangelogEntry;
    })
    .filter((e): e is ChangelogEntry => e !== null);

  return entries;
}

/** 序列化条目数组为可入库的 JSON 字符串 */
export function stringifyChangelogContent(entries: ChangelogEntry[]): string {
  return JSON.stringify(entries);
}

/** 渲染条目数组为对外结构（每条带 html） */
export function renderChangelogEntries(
  entries: ChangelogEntry[],
): RenderedChangelogEntry[] {
  return entries.map(entry => ({
    type: entry.type,
    value: entry.value,
    html: renderSimpleMarkdown(entry.value || ""),
  }));
}

/** 一步：从 DB 文本直接得到带 html 的对外条目 */
export function renderChangelogContent(raw: string | null | undefined): RenderedChangelogEntry[] {
  return renderChangelogEntries(parseChangelogContent(raw));
}
