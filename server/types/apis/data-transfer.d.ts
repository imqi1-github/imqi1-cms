/**
 * 全站数据导出 / 导入（后台「数据备份与恢复」）相关类型。
 *
 * 出于「导入后管理员登录态不丢失」的考量，数据范围刻意排除 users 与 sessions：
 * users 含密码哈希与 auth_code（单端登录凭据），sessions 为临时会话，二者均不参与备份。
 */

/** 单张表的备份规格：表名、导入顺序、需要在导入时还原为 Date 的字段。 */
export interface DataTableSpec {
	/** Prisma 模型名，同时也是数据库物理表名（schema 未使用 @@map）。 */
	model: string;
	/** 需在导入时由 ISO 字符串还原为 Date 的字段。 */
	dateFields: string[];
}

/** 导出文件（也是导入所接收）的载荷结构。 */
export interface DataTransferPayload {
	/** 备份格式版本，用于导入时的兼容性校验。 */
	version: number;
	/** 导出时间（ISO 字符串）。 */
	exportedAt: string;
	/** 各表数据：key 为模型名，value 为该表所有行。 */
	tables: Record<string, Record<string, unknown>[]>;
}

/** Prisma 委托的最小结构，避免对每个模型逐一写联合类型。 */
export interface PrismaModelDelegate {
	findMany: (args?: unknown) => Promise<Record<string, unknown>[]>;
	createMany: (args: { data: Record<string, unknown>[] }) => Promise<{ count: number }>;
}
