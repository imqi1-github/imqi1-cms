import { prisma } from "#server/utils/prisma";
import { getUser } from "#server/lib/auth";
import { validateChangelogData } from "#server/utils/validation";
import {
  normalizeChangelogEntries,
  stringifyChangelogContent,
} from "#server/utils/changelog";

interface ParsedRecord {
  entries: unknown;
  createTime?: string;
}

/**
 * 从 JSON 文件导入更新日志（一键导入）。
 *
 * 前端读取文件文本后以 { source } 发来，由后端权威解析 + 校验 + 入库。
 * 支持两种 JSON 形态：
 *   1) 单条记录：条目数组
 *        [ { "type": "功能", "value": "..." }, ... ]
 *   2) 多条记录：每个元素含 entries（可选 createTime 指定创建时间，便于按日期排序）
 *        [ { "entries": [ { "type": ..., "value": ... } ], "createTime": "2026-06-22" }, ... ]
 *      或单个 { "entries": [...] }
 *
 * 多条记录用事务保证原子性：任一条校验失败则整体回滚。
 */
export default defineEventHandler(async event => {
  // 验证用户登录
  const user = await getUser(event);

  if (!user) {
    throw createError({
      statusCode: 401,
      message: "请先登录",
    });
  }

  const body = await readBody(event);
  const source = body?.source;

  if (typeof source !== "string" || !source.trim()) {
    throw createError({
      statusCode: 400,
      message: "JSON 文件内容为空",
    });
  }

  // 解析 JSON
  let data: unknown;
  try {
    data = JSON.parse(source);
  } catch {
    throw createError({
      statusCode: 400,
      message: "JSON 格式错误，无法解析",
    });
  }

  // 统一解析为「记录列表」（每条记录写入一行 changelogs）
  const records: ParsedRecord[] = [];
  const asRecord = (v: unknown): Record<string, unknown> | null =>
    v && typeof v === "object" ? (v as Record<string, unknown>) : null;

  if (Array.isArray(data)) {
    const firstObj = asRecord(data[0]);
    const looksLikeMulti = !!firstObj && Array.isArray(firstObj.entries);

    if (looksLikeMulti) {
      // 多条记录：[{ entries, createTime? }, ...]
      for (const item of data) {
        const obj = asRecord(item) ?? {};
        records.push({
          entries: obj.entries,
          createTime: typeof obj.createTime === "string" ? obj.createTime : undefined,
        });
      }
    } else {
      // 单条记录：整个数组就是一条记录的条目
      records.push({ entries: data });
    }
  } else {
    const obj = asRecord(data);
    if (obj && Array.isArray(obj.entries)) {
      // 单个 { entries: [...], createTime? }
      records.push({
        entries: obj.entries,
        createTime: typeof obj.createTime === "string" ? obj.createTime : undefined,
      });
    } else {
      throw createError({
        statusCode: 400,
        message: "JSON 应为条目数组 [{type,value}, ...] 或 [{entries:[...]}, ...]",
      });
    }
  }

  if (records.length === 0) {
    throw createError({
      statusCode: 400,
      message: "未找到可导入的记录",
    });
  }

  // 事务：任一条校验失败则整体回滚
  const created = await prisma.$transaction(async tx => {
    const out = [];
    for (const rec of records) {
      const entries = normalizeChangelogEntries(rec.entries);
      validateChangelogData(entries);

      // 可选 createTime：非法日期时回退为默认（now）
      const payload: { content: string; create_time?: Date } = {
        content: stringifyChangelogContent(entries),
      };
      if (rec.createTime) {
        const d = new Date(rec.createTime);
        if (!Number.isNaN(d.getTime())) {
          payload.create_time = d;
        }
      }

      const log = await tx.changelogs.create({ data: payload });
      out.push(log);
    }
    return out;
  });

  return {
    success: true,
    imported: created.length,
  };
});
