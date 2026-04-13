import { getIpLocation, queryIpLocation, getQQWryVersion } from "#server/utils/qqwry";

export default defineEventHandler(async event => {
  const query = getQuery(event);
  const ip = (query.ip as string) || "8.8.8.8";

  try {
    // 获取详细信息
    const detail = await queryIpLocation(ip);

    // 获取简洁信息
    const location = await getIpLocation(ip);

    // 获取数据库版本
    const version = await getQQWryVersion();

    return {
      ip,
      version,
      detail,
      location,
    };
  } catch (error) {
    return {
      error: error instanceof Error ? error.message : String(error),
      stack: error instanceof Error ? error.stack : undefined,
    };
  }
});
