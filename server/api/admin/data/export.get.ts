import { getUser } from "#server/lib/auth";
import {
	DATA_TABLES,
	DATA_TRANSFER_VERSION,
	getDelegate,
	SENSITIVE_INFORMATIONS_KEYS,
	SENSITIVE_MASK,
} from "#server/utils/data-transfer";
import type { DataTransferPayload } from "#server/types/apis/data-transfer";

/**
 * 导出全站数据（后台「数据备份与恢复」）。
 *
 * 返回 JSON 载荷 { version, exportedAt, tables }，前端据此下载为文件。
 * 数据范围见 DATA_TABLES —— 排除 users 与 sessions。
 * informations 表中敏感配置（SMTP/COS/百度密钥）在导出时掩码，避免备份文件明文携带真实密钥。
 */
export default defineEventHandler(async event => {
	const user = await getUser(event);
	if (!user) {
		throw createError({ statusCode: 401, message: "请先登录" });
	}

	const tables: DataTransferPayload["tables"] = {};

	try {
		for (const spec of DATA_TABLES) {
			const rows = (await getDelegate(spec.model).findMany()) as Record<string, unknown>[];
			// informations：敏感配置掩码后导出（密钥不随备份明文落盘，恢复后需在后台重设）
			if (spec.model === "informations") {
				tables[spec.model] = rows.map(row => {
					return { ...row, value: SENSITIVE_INFORMATIONS_KEYS.has(String(row.key)) ? SENSITIVE_MASK : row.value };
				});
			} else {
				tables[spec.model] = rows;
			}
		}
	} catch (error) {
		// 已带 statusCode 的错误（getDelegate 的「未知表」500）原样抛出，保留具体表名
		if (error && typeof error === "object" && "statusCode" in error) {
			throw error;
		}
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
