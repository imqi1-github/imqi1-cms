import { getUser } from "#server/lib/auth";
import { DATA_TABLES, DATA_TRANSFER_VERSION, getDelegate } from "#server/utils/data-transfer";
import type { DataTransferPayload } from "#server/types/apis/data-transfer";

/**
 * 导出全站数据（后台「数据备份与恢复」）。
 *
 * 返回 JSON 载荷 { version, exportedAt, tables }，前端据此下载为文件。
 * 数据范围见 DATA_TABLES —— 排除 users 与 sessions。
 */
export default defineEventHandler(async event => {
	const user = await getUser(event);
	if (!user) {
		throw createError({ statusCode: 401, message: "请先登录" });
	}

	const tables: DataTransferPayload["tables"] = {};

	try {
		for (const spec of DATA_TABLES) {
			tables[spec.model] = await getDelegate(spec.model).findMany();
		}
	} catch (error) {
		console.error("[data/export] 导出失败:", error);
		throw createError({ statusCode: 500, message: "导出数据失败" });
	}

	const payload: DataTransferPayload = {
		version: DATA_TRANSFER_VERSION,
		exportedAt: new Date().toISOString(),
		tables,
	};

	// 提示前端以附件形式下载
	setHeader(event, "Content-Type", "application/json; charset=utf-8");
	setHeader(event, "Content-Disposition", `attachment; filename="data-backup-${Date.now()}.json"`);

	return payload;
});
