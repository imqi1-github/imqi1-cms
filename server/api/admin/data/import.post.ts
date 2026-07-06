import { getUser } from "#server/lib/auth";
import { validateCsrfToken } from "#server/utils/csrf";
import { prisma } from "#server/utils/prisma";
import { DATA_TABLES, DATA_TRANSFER_VERSION, reviveRowsForImport } from "#server/utils/data-transfer";
import type { DataTransferPayload, PrismaModelDelegate } from "#server/types/apis/data-transfer";

/**
 * 导入全站数据（后台「数据备份与恢复」）。
 *
 * 策略：清空后完整还原。整个过程包裹在事务中：
 *   1. 关闭外键检查（允许乱序清空/插入，且允许 posts.uid 指向未被还原的 users）
 *   2. 逆序 DELETE 清空各表（用 DELETE 而非 TRUNCATE —— TRUNCATE 在 MySQL 会隐式提交，破坏事务）
 *   3. 顺序 createMany 写入备份数据
 *   4. finally 恢复外键检查
 * 任一步失败则整体回滚，不会留下半还原的脏数据。
 *
 * 数据范围排除 users 与 sessions，因此当前管理员登录态在导入后依然有效。
 */
export default defineEventHandler(async event => {
	const body = await readBody(event);
	const { csrfToken, source } = body ?? {};

	// CSRF 验证
	if (!validateCsrfToken(event, csrfToken)) {
		throw createError({ statusCode: 403, message: "CSRF token 验证失败，请刷新页面重试" });
	}

	// 验证用户登录
	const user = await getUser(event);
	if (!user) {
		throw createError({ statusCode: 401, message: "请先登录" });
	}

	if (typeof source !== "string" || !source.trim()) {
		throw createError({ statusCode: 400, message: "备份文件内容为空" });
	}

	// 解析 JSON
	let payload: DataTransferPayload;
	try {
		payload = JSON.parse(source) as DataTransferPayload;
	} catch (error) {
		console.error("[data/import] JSON 解析失败:", error);
		throw createError({ statusCode: 400, message: "备份文件格式错误，无法解析" });
	}

	// 结构与版本校验
	if (!payload || typeof payload !== "object" || typeof payload.tables !== "object" || payload.tables === null) {
		throw createError({ statusCode: 400, message: "备份文件结构无效，缺少 tables 字段" });
	}
	if (payload.version !== DATA_TRANSFER_VERSION) {
		throw createError({
			statusCode: 400,
			message: `备份版本不兼容（文件 v${payload.version ?? "?"}，当前 v${DATA_TRANSFER_VERSION}）`,
		});
	}

	try {
		const imported = await prisma.$transaction(
			async tx => {
				const counts: Record<string, number> = {};

				// 关闭外键检查
				await tx.$executeRawUnsafe("SET FOREIGN_KEY_CHECKS = 0");

				try {
					// 逆序清空（父表在后），配合关检查确保干净
					for (const spec of [...DATA_TABLES].reverse()) {
						await tx.$executeRawUnsafe(`DELETE FROM \`${spec.model}\``);
					}

					// 顺序写入
					for (const spec of DATA_TABLES) {
						const rows = payload.tables[spec.model];
						if (!Array.isArray(rows) || rows.length === 0) {
							counts[spec.model] = 0;
							continue;
						}

						const delegate = (tx as unknown as Record<string, PrismaModelDelegate>)[spec.model];
						const data = reviveRowsForImport(rows, spec.dateFields);
						const result = await delegate.createMany({ data });
						counts[spec.model] = result.count;
					}
				} finally {
					// 无论成功与否都恢复外键检查（同一连接上的会话变量）
					await tx.$executeRawUnsafe("SET FOREIGN_KEY_CHECKS = 1");
				}

				return counts;
			},
			// 整站还原可能较大，放宽事务超时
			{ timeout: 120_000, maxWait: 10_000 },
		);

		const total = Object.values(imported).reduce((sum, n) => sum + n, 0);
		return { success: true, total, tables: imported };
	} catch (error) {
		console.error("[data/import] 导入失败，已回滚:", error);
		throw createError({ statusCode: 500, message: "导入数据失败，已回滚，未改动现有数据" });
	}
});
