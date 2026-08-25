import { getUser } from "#server/lib/auth";
import { validateCsrfToken } from "#server/utils/csrf";
import { prisma } from "#server/utils/prisma";
import {
	DATA_TABLES,
	DATA_TRANSFER_VERSION,
	getDelegate,
	reviveRowsForImport,
	SENSITIVE_INFORMATIONS_KEYS,
	SENSITIVE_MASK,
} from "#server/utils/data-transfer";
import type { DataTransferPayload } from "#server/types/apis/data-transfer";

/**
 * 导入全站数据（后台「数据备份与恢复」）。
 *
 * 策略：清空后完整还原。整个过程包裹在事务中：
 *   1. 关闭外键检查（允许乱序清空/插入，且允许 contents.uid 指向未被还原的 users）
 *   2. 逆序 DELETE 清空各表（用 DELETE 而非 TRUNCATE —— TRUNCATE 在 MySQL 会隐式提交，破坏事务）
 *   3. 顺序 createMany 写入备份数据
 *   4. finally 恢复外键检查
 * 任一步失败则整体回滚，不会留下半还原的脏数据。
 *
 * 数据范围排除 users 与 sessions，因此当前管理员登录态在导入后依然有效。
 * 此外 informations 表中的 sessionStoreType（Session 存储方式）属于本机部署配置，
 * 导入时保留原值、不被备份文件覆盖。
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
	// 体积上限：数十 MB 的超大导入会耗尽内存/连接（JSON.parse + createMany 全表），前置拦截为 400
	if (source.length > 50 * 1024 * 1024) {
		throw createError({ statusCode: 400, message: "备份文件过大" });
	}

	// 解析 JSON
	let payload: DataTransferPayload;
	try {
		payload = JSON.parse(source) as DataTransferPayload;
	} catch {
		// 预期 400（客户端坏 JSON）：不打印完整堆栈
		console.warn("[data/import] 备份文件 JSON 解析失败");
		throw createError({ statusCode: 400, message: "备份文件格式错误，无法解析" });
	}

	// 结构与版本校验
	if (
		!payload ||
		typeof payload !== "object" ||
		!payload.tables ||
		typeof payload.tables !== "object" ||
		Array.isArray(payload.tables)
	) {
		throw createError({ statusCode: 400, message: "备份文件结构无效，缺少 tables 字段" });
	}
	if (payload.version !== DATA_TRANSFER_VERSION) {
		throw createError({
			statusCode: 400,
			message: `备份版本不兼容（文件 v${payload.version ?? "?"}，当前 v${DATA_TRANSFER_VERSION}）`,
		});
	}
	// 完整性：每个已知数据表都必须出现（空数组 = 合法的空表；缺失键 = 备份结构残缺）。
	// 必须在清空各表之前校验，否则残缺备份会先 DELETE 全库再只回写部分表，造成数据丢失。
	for (const spec of DATA_TABLES) {
		if (!Array.isArray(payload.tables[spec.model])) {
			throw createError({ statusCode: 400, message: `备份文件缺少数据表：${spec.model}` });
		}
	}

	try {
		const imported = await prisma.$transaction(
			async tx => {
				const counts: Record<string, number> = {};

				// 记住当前的 Session 存储方式：该配置属于本机部署环境，不应被外来备份覆盖，
				// 与 users / sessions 被排除的考量一致（保证导入后登录态与会话存储行为不变）。
				const sessionStore = await tx.informations.findUnique({ where: { key: "sessionStoreType" } });
				// 记住当前敏感配置（SMTP/COS/百度密钥）的原始值：备份文件中这些值是掩码，
				// 不能用 "********" 覆盖真实密钥，恢复后需回填原值。
				const sensitiveBefore = await tx.informations.findMany({
					where: { key: { in: [...SENSITIVE_INFORMATIONS_KEYS] } },
				});

				// 关闭外键检查
				await tx.$executeRawUnsafe("SET FOREIGN_KEY_CHECKS = 0");

				try {
					// 逆序清空（父表在后），配合关检查确保干净
					for (const spec of [...DATA_TABLES].reverse()) {
						await tx.$executeRawUnsafe(`DELETE FROM \`${spec.model}\``);
					}

					// 顺序写入
					for (const spec of DATA_TABLES) {
						let rows = payload.tables[spec.model];
						// informations 表：剔除备份中的 sessionStoreType（保留本机原值，见下方补回），
						// 并剔除被掩码的敏感配置（value === SENSITIVE_MASK），避免覆盖真实密钥（见下方回填）。
						if (spec.model === "informations" && Array.isArray(rows)) {
							rows = rows.filter(
								row =>
									row?.key !== "sessionStoreType" &&
									!(SENSITIVE_INFORMATIONS_KEYS.has(String(row?.key)) && row?.value === SENSITIVE_MASK),
							);
						}
						if (!Array.isArray(rows) || rows.length === 0) {
							counts[spec.model] = 0;
							continue;
						}

						const delegate = getDelegate(spec.model, tx);
						if (!delegate || typeof delegate.createMany !== "function") {
							throw createError({ statusCode: 500, message: `未知的数据表：${spec.model}` });
						}
						const data = reviveRowsForImport(rows, spec.dateFields);
						const result = await delegate.createMany({ data });
						counts[spec.model] = result.count;
					}

					// 补回导入前的 Session 存储方式（不受备份文件影响）
					if (sessionStore) {
						await tx.informations.create({ data: { key: "sessionStoreType", value: sessionStore.value } });
					}
					// 回填导入前的敏感配置（备份掩码的密钥不能用 "********" 覆盖，须保留本机真实值）
					for (const row of sensitiveBefore) {
						await tx.informations.upsert({
							where: { key: row.key },
							update: { value: row.value },
							create: { key: row.key, value: row.value },
						});
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
		// 已带 statusCode 的错误（400 结构/版本校验、500 未知表）原样抛出，避免被归一为笼统 500
		if (error && typeof error === "object" && "statusCode" in error) {
			throw error;
		}
		console.error("[data/import] 导入失败，已回滚:", error);
		throw createError({ statusCode: 500, message: "导入数据失败，已回滚，未改动现有数据" });
	}
});
