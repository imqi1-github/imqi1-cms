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

  const body = await readBody(event);
  const { name, desc, cover, cids, longitude, latitude, sort, enabled, csrfToken } = body;

  // CSRF 验证
  if (!validateCsrfToken(event, csrfToken)) {
    throw createError({
      statusCode: 403,
      message: "CSRF token 验证失败，请刷新页面重试",
    });
  }

  if (!name || !name.trim()) {
    throw createError({
      statusCode: 400,
      message: "名称不能为空",
    });
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
  if (!Number.isFinite(sortValue)) {
    throw createError({
      statusCode: 400,
      message: "参数格式不正确",
    });
  }

  // 验证字段长度
  validateTravelData({ name, desc, cover });

  // 检查地点是否存在
  const existing = await prisma.travels.findUnique({
    where: { id },
  });

  if (!existing) {
    throw createError({
      statusCode: 404,
      message: "旅行地点不存在",
    });
  }

  // 更新地点基础字段
  await prisma.travels.update({
    where: { id },
    data: {
      name: name.trim(),
      desc: desc?.trim() || null,
      cover: cover?.trim() || null,
      longitude: lng,
      latitude: lat,
      sort: sortValue,
      enabled: enabled !== false,
    },
  });

  // 仅当请求显式携带 cids 时才全量同步关联（toggleEnabled 不传 cids，避免误清空）
  if (cids !== undefined) {
    const cidList: number[] = Array.isArray(cids)
      ? Array.from(new Set(cids.map(c => Number(c)).filter((c: number) => Number.isInteger(c))))
      : [];

    await prisma.contenttravels.deleteMany({ where: { travel_id: id } });
    if (cidList.length) {
      await prisma.contenttravels.createMany({
        data: cidList.map(cid => ({ travel_id: id, cid })),
        skipDuplicates: true,
      });
    }
  }

  return { success: true };
});
