import { prisma } from "#server/utils/prisma";
import { getUser } from "#server/lib/auth";
import { validateCsrfToken } from "#server/utils/csrf";
import { validateTravelData } from "#server/utils/validation";

export default defineEventHandler(async event => {
  // 验证用户登录
  const user = await getUser(event);

  if (!user) {
    throw createError({
      statusCode: 401,
      message: "请先登录",
    });
  }

  const id = Number(getRouterParam(event, "id"));

  if (!Number.isInteger(id) || id <= 0) {
    throw createError({
      statusCode: 400,
      message: "ID 不能为空",
    });
  }

  const body = (await readBody(event)) ?? {};
  const { name, desc, cover, cids, longitude, latitude, sort, enabled, csrfToken } = body;

  // CSRF 验证
  if (!validateCsrfToken(event, csrfToken)) {
    throw createError({
      statusCode: 403,
      message: "CSRF token 验证失败，请刷新页面重试",
    });
  }

  // 类型 + 空值校验：非字符串（如 name:123）会让 name.trim() 抛 TypeError→500
  if (typeof name !== 'string' || !name.trim()) {
    throw createError({
      statusCode: 400,
      message: "名称不能为空",
    });
  }
  if (desc !== undefined && desc !== null && typeof desc !== 'string') {
    throw createError({ statusCode: 400, message: "简介格式错误" });
  }
  if (cover !== undefined && cover !== null && typeof cover !== 'string') {
    throw createError({ statusCode: 400, message: "封面格式错误" });
  }

  const lng = Number(longitude);
  const lat = Number(latitude);
  const sortValue = sort != null ? Number(sort) : 0;

  if (longitude == null || latitude == null || !Number.isFinite(lng) || !Number.isFinite(lat)) {
    throw createError({
      statusCode: 400,
      message: "经纬度不能为空",
    });
  }
  if (lng < -180 || lng > 180 || lat < -90 || lat > 90) {
    throw createError({
      statusCode: 400,
      message: "经纬度范围不正确",
    });
  }
  // sort 是 Int 字段：浮点（3.5）写入 Int 抛错→500
  if (!Number.isInteger(sortValue)) {
    throw createError({
      statusCode: 400,
      message: "参数格式不正确",
    });
  }

  // 验证字段长度
  validateTravelData({ name, desc, cover });

  // 检查地点是否存在（pre-check 与 update 之间有并发删除窗口，update 会抛 P2025 → 500）
  try {
    const existing = await prisma.travels.findUnique({
      where: { id },
    });

    if (!existing) {
      throw createError({
        statusCode: 404,
        message: "旅行地点不存在",
      });
    }

    // 更新地点基础字段 + 关联全量同步需原子：任一步失败整体回滚，避免「主信息已改、关联未同步」
    await prisma.$transaction(async tx => {
      await tx.travels.update({
        where: { id },
        data: {
          name: name.trim(),
          desc: typeof desc === 'string' ? desc.trim() : null,
          cover: typeof cover === 'string' ? cover.trim() : null,
          longitude: lng,
          latitude: lat,
          sort: sortValue,
          enabled: enabled !== false,
        },
      });

      // 仅当请求显式携带 cids 时才全量同步关联（toggleEnabled 不传 cids，避免误清空）
      if (cids !== undefined) {
        const cidList: number[] = Array.isArray(cids)
          ? Array.from(new Set(cids.map(c => Number(c)).filter((c: number) => Number.isInteger(c) && c > 0)))
          : [];

        await tx.contenttravels.deleteMany({ where: { travel_id: id } });
        if (cidList.length) {
          await tx.contenttravels.createMany({
            data: cidList.map(cid => ({ travel_id: id, cid })),
            skipDuplicates: true,
          });
        }
      }
    });

    return { success: true };
  } catch (error) {
    // 预期 400/404 原样抛，不打印完整堆栈
    if (error instanceof Error && "statusCode" in error) {
      throw error;
    }
    // 并发删除竞态 → update P2025 → 404
    if (error instanceof Error && "code" in error && error.code === "P2025") {
      throw createError({ statusCode: 404, message: "旅行地点不存在" });
    }
    // 传入的文章 cid 不存在 → 外键约束失败 P2003 → 400
    if (error instanceof Error && "code" in error && error.code === "P2003") {
      throw createError({ statusCode: 400, message: "存在无效的文章关联" });
    }
    console.error(error);
    throw createError({ statusCode: 500, message: "更新旅行地点失败" });
  }
});
