import { prisma } from "#server/utils/prisma";
import { getUser } from "#server/lib/auth";
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

  const body = await readBody(event);
  const { name, desc, cover, cids, longitude, latitude, sort, enabled } = body;

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

  // 关联文章 cid 列表：非数组或留空视为不关联，否则校验为整数并去重
  const cidList: number[] = Array.isArray(cids)
    ? Array.from(new Set(cids.map(c => Number(c)).filter((c: number) => Number.isInteger(c))))
    : [];

  // 验证字段长度
  validateTravelData({ name, desc, cover });

  // 创建旅行地点
  const travel = await prisma.travels.create({
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

  // 写入多对多关联（地点创建后，用关联表 createMany 批量插入）
  if (cidList.length) {
    await prisma.contenttravels.createMany({
      data: cidList.map(cid => ({ travel_id: travel.id, cid })),
      skipDuplicates: true,
    });
  }

  return {
    success: true,
    data: travel,
  };
});
