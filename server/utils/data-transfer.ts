import { prisma } from "#server/utils/prisma";
import type { DataTableSpec, PrismaModelDelegate } from "#server/types/apis/data-transfer";

/** 备份格式版本。结构不兼容变更时递增，导入端据此校验。 */
export const DATA_TRANSFER_VERSION = 1;

/**
 * 参与备份的表清单，按「父表在前」排序（便于导入时顺序插入）。
 *
 * 刻意排除：
 *   - users：含密码哈希与 auth_code，导入不覆盖以保留当前登录管理员
 *   - sessions：临时登录会话，无需备份
 *
 * 注意：posts.uid 外键指向 users，因导入不还原 users，
 * 导入时会临时关闭 FOREIGN_KEY_CHECKS，允许 uid 指向现有用户表。
 */
export const DATA_TABLES: DataTableSpec[] = [
	{ model: "attachments", dateFields: ["create_time"] },
	{ model: "metas", dateFields: [] },
	{ model: "changelogs", dateFields: ["create_time"] },
	{ model: "informations", dateFields: [] },
	{ model: "links", dateFields: [] },
	{ model: "travels", dateFields: ["create_time"] },
	{ model: "posts", dateFields: ["create_time", "update_time"] },
	{ model: "comments", dateFields: ["create_time"] },
	{ model: "postrelations", dateFields: [] },
	{ model: "postattachments", dateFields: [] },
	{ model: "posttravels", dateFields: [] },
	{ model: "subscribes", dateFields: ["lastUpdated"] },
	{ model: "subscribeposts", dateFields: ["pubDate", "create_time"] },
];

/** 取得指定模型的 Prisma 委托（findMany / createMany）。 */
export function getDelegate(model: string): PrismaModelDelegate {
	const delegate = (prisma as unknown as Record<string, PrismaModelDelegate>)[model];
	if (!delegate || typeof delegate.findMany !== "function") {
		throw createError({ statusCode: 500, message: `未知的数据表：${model}` });
	}
	return delegate;
}

/**
 * 将导入行中的日期字段由 ISO 字符串还原为 Date，其余字段原样保留。
 * 非法日期直接剔除该字段，交由数据库默认值处理。
 */
export function reviveRowsForImport(
	rows: Record<string, unknown>[],
	dateFields: string[],
): Record<string, unknown>[] {
	if (dateFields.length === 0) return rows;

	return rows.map(row => {
		const next: Record<string, unknown> = { ...row };
		for (const field of dateFields) {
			const value = next[field];
			if (value == null) continue;
			const d = new Date(value as string);
			// 非法日期置为 undefined（createMany 会忽略，交由数据库默认值处理）
			next[field] = Number.isNaN(d.getTime()) ? undefined : d;
		}
		return next;
	});
}
