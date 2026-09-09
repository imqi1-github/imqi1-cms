import { getUser } from "#server/lib/auth";
import { validateCsrfToken } from "#server/utils/csrf";
import { invalidateContentCaches } from "#server/utils/content-cache";
import { prisma } from "#server/utils/prisma";
import { DATA_TABLES, DATA_TRANSFER_VERSION, getDelegate, reviveRowsForImport } from "#server/utils/data-transfer";
import type { DataTransferPayload } from "#server/types/apis/data-transfer";

/**
 * 导入全站数据（后台「数据备份与恢复」）。
 *
 * 策略：清空后完整还原。整个过程包裹在事务中：
 *   1. TRUNCATE ... CASCADE 一把清空全部业务表 —— PG 中 CASCADE 沿外键反向级联，
 *      无需关闭 FK 检查，也避开了 SET session_replication_role 必须是 superuser 的限制。
 *      TRUNCATE 在 PG 是事务安全的（不像 MySQL 会隐式提交）。
 *   2. 顺序 createMany 写入备份数据。
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

				// PG TRUNCATE ... CASCADE 沿外键反向级联清空,无需关 FK 检查,
				// 也避开了 SET session_replication_role 必须是 superuser 的限制。
				// 不加 RESTART IDENTITY —— 保留 SERIAL 当前序列值,避免与外部引用错乱。
				await tx.$executeRawUnsafe(
					`TRUNCATE TABLE ${DATA_TABLES.map(s => `"${s.model}"`).join(", ")} CASCADE`,
				);

				// 顺序写入
				for (const spec of DATA_TABLES) {
					let rows = payload.tables[spec.model];
					// informations 表：仅剔除备份中的 sessionStoreType（保留本机原值，见下方补回）；密钥不再掩码、原样恢复。
					if (spec.model === "informations" && Array.isArray(rows)) {
						rows = rows.filter(row => row?.key !== "sessionStoreType");
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

				// 备份用显式 id 写回，SERIAL 序列不会自动推进（nextval 只在默认值触发）。
				// 若不重置，后续 insert（含下方补回 sessionStoreType 的自增 id）会与已经导入的
				// 自增主键撞车（informations_pkey 之类）。对每张单列自增主键表把序列重置到 MAX(id)+1。
				// 复合主键表（contentrelations/contentattachments/contenttravels）无序列，跳过。
				for (const [table, col] of [
					["attachments", "aid"],
					["metas", "mid"],
					["changelogs", "id"],
					["informations", "id"],
					["links", "id"],
					["travels", "id"],
					["contents", "cid"],
					["comments", "coid"],
					["subscribes", "id"],
					["subscribeposts", "id"],
				] as const) {
					await tx.$executeRawUnsafe(
						`SELECT setval(pg_get_serial_sequence('${table}', '${col}'), COALESCE((SELECT MAX(${col}) FROM "${table}"), 0) + 1, false)`,
					);
				}

				// 补回导入前的 Session 存储方式（不受备份文件影响）
				if (sessionStore) {
					await tx.informations.create({ data: { key: "sessionStoreType", value: sessionStore.value } });
				}

				return counts;
			},
			// 整站还原可能较大，放宽事务超时
			{ timeout: 120_000, maxWait: 10_000 },
		);

		const total = Object.values(imported).reduce((sum, n) => sum + n, 0);
		// 整站数据导入 → 影响所有 ISR 页面（首页/分类/标签/文章/订阅/友链/地图/更新日志/关于/站点地图…），清空全部缓存
	void invalidateContentCaches().catch(err => console.error("[cache] 数据导入失效缓存失败", err));

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
