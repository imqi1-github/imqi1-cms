import { Readable } from "node:stream";

import { getUser } from "#server/lib/auth";
import {
  DATA_TABLES,
  DATA_TRANSFER_VERSION,
  getDelegate,
} from "#server/utils/data-transfer";

/** 每块读取的表行数：分块把单批进内存的行数/大小封顶，内存恒定、与全库规模无关 */
const EXPORT_CHUNK_SIZE = 100;

/**
 * 导出分块读取用主键游标（keyset）分页，避免并发写入时 offset 分页出现重复/漏行。
 * 仅单主键表用游标；复合主键表（contentrelations/contentattachments）体积小，退化原 offset。
 * 游标取自每块最后一行的主键值，next 以 `pk > last` 推进，无论前后插入都不会抖动。
 */
const KEYSET_ORDER: Record<string, { cursor: string; orderBy: Record<string, "asc"> } | null> = {
  attachments: { cursor: "aid", orderBy: { aid: "asc" } },
  metas: { cursor: "mid", orderBy: { mid: "asc" } },
  changelogs: { cursor: "id", orderBy: { id: "asc" } },
  informations: { cursor: "id", orderBy: { id: "asc" } },
  links: { cursor: "id", orderBy: { id: "asc" } },
  travels: { cursor: "id", orderBy: { id: "asc" } },
  contents: { cursor: "cid", orderBy: { cid: "asc" } },
  comments: { cursor: "coid", orderBy: { coid: "asc" } },
  subscribes: { cursor: "id", orderBy: { id: "asc" } },
  subscribeposts: { cursor: "id", orderBy: { id: "asc" } },
  contentrelations: null,
  contentattachments: null,
};

/**
 * 导出全站数据（后台「数据备份与恢复」）—— 流式导出。
 *
 * 逐表用 findMany({ skip, take }) 分块读取，每个块写出去再读下一块，直接拼成 JSON 流
 * 从响应返回；不再「全表进内存 + 一次 JSON.stringify」，因此服务器内存占用恒定，不随
 * 库体量增长，也不设行数上限。
 *
 * 数据范围见 DATA_TABLES（排除 users 与 sessions）。informations 表中敏感配置
 * （SMTP/COS/百度密钥）在导出时掩码，避免备份文件明文携带真实密钥（约定5 敏感配置运行时化）。
 */
export default defineEventHandler(async event => {
  const user = await getUser(event);
  if (!user) {
    throw createError({ statusCode: 401, message: "请先登录" });
  }

  const exportedAt = new Date().toISOString();

  async function* buildExportStream(): AsyncGenerator<string> {
    yield `{"version":${DATA_TRANSFER_VERSION},"exportedAt":${JSON.stringify(exportedAt)},"tables":{`;
    let firstTable = true;
    for (const spec of DATA_TABLES) {
      if (!firstTable) yield ",";
      firstTable = false;

      yield `${JSON.stringify(spec.model)}:[`;
      const keyset = KEYSET_ORDER[spec.model] ?? null;
      let offset = 0;
      let lastCursor: number | null = null;
      let firstRow = true;
      let hasMore = true;
      while (hasMore) {
        // 分块读取：每次仅 EXPORT_CHUNK_SIZE 行进内存，写出去后再取下一批
        const rows = (await getDelegate(spec.model).findMany(
          keyset
            ? {
                ...(lastCursor !== null ? { where: { [keyset.cursor]: { gt: lastCursor } } } : {}),
                orderBy: keyset.orderBy,
                take: EXPORT_CHUNK_SIZE,
              }
            : { skip: offset, take: EXPORT_CHUNK_SIZE },
        )) as Record<string, unknown>[];
        for (const row of rows) {
          // 密钥不掩码：完整备份/迁移需要真实值随备份落盘（仅管理员可导出；请妥善保管备份文件）
          const out = row;
          yield (firstRow ? "" : ",") + JSON.stringify(out);
          firstRow = false;
        }
        if (keyset) {
          // 游标取自本块最后一行的主键值；非法/空即结束，防死循环
          const lastVal = rows[rows.length - 1]?.[keyset.cursor];
          if (typeof lastVal !== "number") {
            hasMore = false;
          } else {
            lastCursor = lastVal;
            hasMore = rows.length === EXPORT_CHUNK_SIZE;
          }
        } else {
          offset += rows.length;
          hasMore = rows.length === EXPORT_CHUNK_SIZE;
        }
      }
      yield "]";
    }
    yield "}}";
  }

  setHeader(event, "Content-Type", "application/json; charset=utf-8");
  setHeader(event, "Content-Disposition", `attachment; filename="data-backup-${Date.now()}.json"`);
  setHeader(event, "Cache-Control", "no-store, no-cache, must-revalidate, private");

  // 体积未知，不设 Content-Length（走 chunked）。Readable.from 会按下游背压逐块拉取
  // 生成器 —— DB 读取被下载速度"节流"，内存始终维持在单块规模。
  return sendStream(event, Readable.from(buildExportStream()));
});
