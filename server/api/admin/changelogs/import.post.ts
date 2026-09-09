import { prisma } from "#server/utils/prisma";
import { getUser } from "#server/lib/auth";
import { validateCsrfToken } from "#server/utils/csrf";
import { validateChangelogData } from "#server/utils/validation";
import { invalidateContentCaches } from "#server/utils/content-cache";
import { normalizeChangelogEntries, stringifyChangelogContent } from "#server/utils/changelog";
import type { ChangelogInputJson, ChangelogInputRecord, ParsedRecord } from "#server/types/apis/changelog-import";
import type { ChangelogEntry } from "#shared/changelog";

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

  const body = (await readBody(event)) ?? {};
  const { csrfToken } = body as { csrfToken?: string };
  if (!validateCsrfToken(event, csrfToken ?? "")) {
    throw createError({ statusCode: 403, message: "CSRF token 验证失败，请刷新页面重试" });
  }
  const source = body?.source;

  if (typeof source !== "string" || !source.trim()) {
    throw createError({
      statusCode: 400,
      message: "JSON 文件内容为空",
    });
  }

  // 解析 JSON
  let data: ChangelogInputJson;
  try {
    data = JSON.parse(source) as ChangelogInputJson;
  } catch {
    // 用户传了坏 JSON：预期 400，用 warn 以免打印完整 SyntaxError 堆栈
    console.warn("changelog import: invalid JSON");
    throw createError({
      statusCode: 400,
      message: "JSON 格式错误，无法解析",
    });
  }

  // 统一解析为「记录列表」（每条记录写入一行 changelogs）
  const records: (ParsedRecord | ChangelogInputRecord)[] = [];
  const asRecord = (v: unknown): ChangelogInputRecord | null =>
    v && typeof v === "object" && !Array.isArray(v) && "entries" in v ? (v as ChangelogInputRecord) : null;

  if (Array.isArray(data)) {
    const firstObj = asRecord(data[0]);
    const looksLikeMulti = !!firstObj && Array.isArray(firstObj.entries);

    if (looksLikeMulti) {
      // 多条记录：[{ entries, createTime? }, ...]
      for (const item of data) {
        const obj = asRecord(item);
        if (obj) {
          records.push({
            entries: obj.entries,
            createTime: obj.createTime,
          });
        }
      }
    } else {
      // 单条记录：整个数组就是一条记录的条目
      records.push({ entries: data as ChangelogEntry[] });
    }
  } else {
    const obj = asRecord(data);
    if (obj && Array.isArray(obj.entries)) {
      // 单个 { entries: [...], createTime? }
      records.push({
        entries: obj.entries,
        createTime: obj.createTime,
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

      // 序列化后的 content 在 PG 为 TEXT（无 65535 上限），仍保留保守护栏防单条超大内容；单条超限提前拦成 400，避免过了校验却 DB 报错
      const serialized = stringifyChangelogContent(entries);
      if (Buffer.byteLength(serialized, "utf8") > 65535) {
        throw createError({
          statusCode: 400,
          message: "单条更新日志内容过长，无法导入",
        });
      }

      // 可选 createTime：非法日期时回退为默认（now）
      // 强制 UTC：PG TIMESTAMP(3) 字面值按 session TZ 解析，若服务器 TZ 非 UTC，
      // 纯日期 '2026-06-22' 会被解读为本地 00:00，存进 DB 后与 ISO UTC 写入存在时区差，
      // 导致 changelogs 时间显示/排序错位。统一转 UTC ISO 再交给 Prisma。
      const payload: { content: string; create_time?: Date } = {
        content: serialized,
      };
      if (rec.createTime) {
        const d = new Date(rec.createTime);
        if (!Number.isNaN(d.getTime())) {
          payload.create_time = new Date(d.toISOString());
        }
      }

      const log = await tx.changelogs.create({ data: payload });
      out.push(log);
    }
    return out;
  });

  // 更新日志变更 → 立即失效更新日志页/首页 ISR 缓存（best-effort）
  void invalidateContentCaches({ routes: ["/", "/changelogs"] }).catch(err => console.error("[cache] 更新日志导入失效缓存失败", err));

  return {
    success: true,
    imported: created.length,
  };
});
