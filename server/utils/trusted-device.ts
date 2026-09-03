import { randomBytes } from "crypto";

import { prisma } from "#server/utils/prisma";

/** 信任设备默认时长（天） */
export const TRUST_DAYS = 30;

/** 生成不可预测的 deviceId（cookie 存它，DB 记录为准） */
export function generateDeviceId(): string {
  return randomBytes(24).toString("hex");
}

/** 记录一台已信任设备（2FA 登录勾选时调用；同 deviceId 覆盖刷新有效期） */
export async function createTrustedDevice(input: {
  userId: number;
  deviceId: string;
  userAgent: string | null;
  ip: string | null;
}): Promise<void> {
  const expiresAt = new Date(Date.now() + TRUST_DAYS * 24 * 60 * 60 * 1000);
  await prisma.trusted_devices.upsert({
    where: { deviceId: input.deviceId },
    create: { ...input, expiresAt, lastUsedAt: new Date() },
    update: { userAgent: input.userAgent, ip: input.ip, expiresAt, lastUsedAt: new Date() },
  });
}

/** cookie 携带的 deviceId 是否仍可信（记录存在 + 属于该 uid + 未过期） */
export async function verifyTrustedDevice(deviceId: string, userId: number): Promise<boolean> {
  if (!deviceId) return false;
  const rec = await prisma.trusted_devices.findUnique({
    where: { deviceId },
    select: { userId: true, expiresAt: true },
  });
  if (!rec || rec.userId !== userId || rec.expiresAt.getTime() < Date.now()) return false;
  // 低频刷新最近使用时间，便于后台排序展示
  await prisma.trusted_devices.update({ where: { deviceId }, data: { lastUsedAt: new Date() } });
  return true;
}

/** 列出某用户的已信任设备（后台管理用） */
export async function listTrustedDevices(userId: number) {
  return prisma.trusted_devices.findMany({
    where: { userId },
    orderBy: { lastUsedAt: "desc" },
    select: {
      id: true,
      deviceId: true,
      userAgent: true,
      ip: true,
      lastUsedAt: true,
      expiresAt: true,
      create_time: true,
    },
  });
}

/** 撤回一台已信任设备（仅限本人） */
export async function revokeTrustedDevice(id: number, userId: number): Promise<number> {
  const { count } = await prisma.trusted_devices.deleteMany({ where: { id, userId } });
  return count;
}
