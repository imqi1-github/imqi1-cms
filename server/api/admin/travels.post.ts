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

  const body = (await readBody(event)) ?? {};
  const { name, desc, cover, cids, longitude, latitude, sort, enabled, csrfToken } = body;

  // CSRF 验证
  if (!validateCsrfToken(event, csrfToken)) {
    throw createError({
      statusCode: 403,
      message: "CSRF token 验证失败，请刷新页面重试",
    });
  }

  // 类型 + 空值校验：非字符串 truthy（如 name:123）会让 name.trim() 抛 TypeError→500
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
  // sort 是 Int 字段：只查 isFinite 会让浮点（3.5）写入 Int 抛错→500
  if (!Number.isInteger(sortValue)) {
    throw createError({
      statusCode: 400,
      message: "参数格式不正确",
    });
  }

  // 关联文章 cid 列表：非数组或留空视为不关联，否则校验为正整数去重
  const cidList: number[] = Array.isArray(cids)
    ? Array.from(new Set(cids.map(c => Number(c)).filter((c: number) => Number.isInteger(c) && c > 0)))
    : [];

  // 验证字段长度
  validateTravelData({ name, desc, cover });

  // 创建旅行地点 + 批量写关联需原子：任一步失败整体回滚，避免「地点已建、关联缺失」
  try {
    await prisma.$transaction(async tx => {
      const travel = await tx.travels.create({
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

      // 写入多对多关联（地点创建后，用关联表 createMany 批量插入）
      if (cidList.length) {
        await tx.contenttravels.createMany({
          data: cidList.map(cid => ({ travel_id: travel.id, cid })),
          skipDuplicates: true,
        });
      }
    });
  } catch (error) {
    // 传入的文章 cid 不存在 → 外键约束失败 P2003 → 400（否则整文件无 catch 冒出 500）
    if (error instanceof Error && 'code' in error && error.code === "P2003") {
      throw createError({ statusCode: 400, message: "存在无效的文章关联" });
    }
    console.error(error);
    throw createError({ statusCode: 500, message: "创建旅行地点失败" });
  }

  return { success: true };
});
