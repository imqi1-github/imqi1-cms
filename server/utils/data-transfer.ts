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
 * 注意：contents.uid 外键指向 users，因导入不还原 users，
 * 导入时会临时关闭外键检查（PG 用 session_replication_role），允许 uid 指向现有用户表。
 *
 * 兼容性：model 同时作为 Prisma 委托名与原始 SQL 表名使用。contents→contents
 * 重命名后，旧版备份（键名为 contents/contentrelations/...）导入时会匹配不到新表
 * 而静默写入 0 行，需先迁移备份键名或重新导出。
 */
export const DATA_TABLES: DataTableSpec[] = [
	{ model: "attachments", dateFields: ["create_time"] },
	{ model: "metas", dateFields: [] },
	{ model: "changelogs", dateFields: ["create_time"] },
	{ model: "informations", dateFields: [] },
	{ model: "links", dateFields: [] },
	{ model: "travels", dateFields: ["create_time"] },
	{ model: "contents", dateFields: ["create_time", "update_time"] },
	{ model: "comments", dateFields: ["create_time"] },
	{ model: "contentrelations", dateFields: [] },
	{ model: "contentattachments", dateFields: [] },
	{ model: "contenttravels", dateFields: [] },
	{ model: "subscribes", dateFields: ["lastUpdated"] },
	{ model: "subscribeposts", dateFields: ["pubDate", "create_time"] },
];

/**
 * 取得指定模型的 Prisma 委托（findMany / createMany 等）。
 * client 传 prisma 或事务 tx；默认 prisma（导出用），导入事务内传 tx。
 * 这是全仓唯一一处「字符串索引 prisma 委托」的 double-as 收口点，集中在此便于审计与替换。
 */
export function getDelegate(model: string, client: object = prisma): PrismaModelDelegate {
	const delegate = (client as unknown as Record<string, PrismaModelDelegate>)[model];
	if (!delegate) {
		throw createError({ statusCode: 500, message: `未知的数据表：${model}` });
	}
	return delegate;
}

/**
 * informations 表中按 key 存储的敏感配置项（SMTP 密钥/COS 密钥/百度审核密钥等）。
 * 导出备份时必须掩码或剔除，与 settings.get 的 SENSITIVE_KEYS 一致——
 * 否则下载的备份文件会明文携带真实密钥（约定5 敏感配置运行时化）。
 * 恢复后这些值需在后台重新填写。
 */
export const SENSITIVE_INFORMATIONS_KEYS = new Set([
	"smtpUser",
	"smtpPassword",
	"cosSecretId",
	"cosSecretKey",
	"baiduApiKey",
	"baiduSecretKey",
]);
export const SENSITIVE_MASK = "********";

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
