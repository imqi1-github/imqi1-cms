import { getUser } from "#server/lib/auth";
import { getIpLocation } from "#server/utils/qqwry";
import { listTrustedDevices } from "#server/utils/trusted-device";

/**
 * 后台：列出当前账户的已信任设备（GET）
 * 复用 server/utils/qqwry 内置 qqwry.ipdb，附带 IP 归属地 + 运营商；
 * 单 IP 查询平均 <1ms，结果按 IP 入 24h 内存缓存（去重 + 防抖动），
 * 多设备列表的并发查询由 Promise.all 触发、并由 qqwry 内部串行化避免重复 IPC。
 */
export default defineEventHandler(async event => {
  const user = await getUser(event);
  if (!user) {
    throw createError({ statusCode: 401, message: "未登录" });
  }

  const devices = await listTrustedDevices(user.uid);

  // 仅对有 IP 的记录查归属地；空 IP 跳过（qqwry 对 null 也会返回 null，但省一次异步调用）
  const locationMap = new Map<string, { location: string; isp: string } | null>();
  const uniqueIps = Array.from(
    new Set(
      devices
        .map(d => d.ip)
        .filter((ip): ip is string => typeof ip === "string" && ip.length > 0),
    ),
  );

  const locationEntries = await Promise.all(
    uniqueIps.map(async ip => {
      const info = await getIpLocation(ip);
      return [ip, info] as const;
    }),
  );
  for (const [ip, info] of locationEntries) {
    locationMap.set(ip, info);
  }

  // 显式字段白名单（禁 ...row），隐私/内部字段不外泄；顺序与 UI 展示对齐
  const enriched = devices.map(d => {
    const info = d.ip ? (locationMap.get(d.ip) ?? null) : null;
    return {
      id: d.id,
      deviceId: d.deviceId,
      name: d.name,
      ip: d.ip,
      location: info?.location ?? "",
      isp: info?.isp ?? "",
      lastUsedAt: d.lastUsedAt.toISOString(),
      expiresAt: d.expiresAt.toISOString(),
      create_time: d.create_time.toISOString(),
    };
  });

  return { devices: enriched };
});