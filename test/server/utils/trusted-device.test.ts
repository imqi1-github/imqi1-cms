import "#test/helpers/nitro-globals";

import { beforeEach, describe, expect, test } from "bun:test";

import { mockSharedPrisma, sharedFake } from "#test/helpers/fake-prisma";

mockSharedPrisma();

// trusted_devices 内存表
interface Row { id: number; deviceId: string; userId: number; name: string | null; ip: string | null; expiresAt: Date; lastUsedAt: Date; create_time: Date }
let rows: Row[] = [];
const seed = (): Row[] => [
  { id: 1, deviceId: "dev-live", userId: 1, name: "手机", ip: "1.2.3.4", expiresAt: new Date(Date.now() + 86_400_000), lastUsedAt: new Date(), create_time: new Date() },
  { id: 2, deviceId: "dev-expired", userId: 1, name: null, ip: null, expiresAt: new Date(Date.now() - 1000), lastUsedAt: new Date(), create_time: new Date() },
];

sharedFake.on("trusted_devices", "upsert", async ({ where, create }: { where: { deviceId: string }; create: Row }) => {
  const exist = rows.find(r => r.deviceId === where.deviceId);
  if (exist) return exist;
  const row: Row = { ...create, id: rows.length + 10 };
  rows.push(row);
  return row;
});
sharedFake.on("trusted_devices", "findUnique", async ({ where }: { where: { deviceId: string } }) =>
  rows.find(r => r.deviceId === where.deviceId) ?? null);
sharedFake.on("trusted_devices", "update", async ({ where }: { where: { deviceId: string } }) =>
  rows.find(r => r.deviceId === where.deviceId)!);
sharedFake.on("trusted_devices", "findMany", async ({ where }: { where: { userId: number } }) =>
  rows.filter(r => r.userId === where.userId).map(r => ({ ...r })));
sharedFake.on("trusted_devices", "deleteMany", async ({ where }: { where: { id: number; userId: number } }) => {
  const before = rows.length;
  rows = rows.filter(r => !(r.id === where.id && r.userId === where.userId));
  return { count: before - rows.length };
});
sharedFake.on("trusted_devices", "updateMany", async ({ where, data }: { where: { id: number; userId: number }; data: { name: string | null } }) => {
  let count = 0;
  for (const r of rows) {
    if (r.id === where.id && r.userId === where.userId) {
      r.name = data.name ?? null;
      count++;
    }
  }
  return { count };
});

const {
  createTrustedDevice,
  verifyTrustedDevice,
  listTrustedDevices,
  revokeTrustedDevice,
  renameTrustedDevice,
  TRUST_DAYS,
} = await import("#server/utils/trusted-device");

describe("trusted-device(prisma 假件)", () => {
  beforeEach(() => {
    rows = seed();
  });

  test("createTrustedDevice:过期时间 = now + 30 天", async () => {
    await createTrustedDevice({ userId: 1, deviceId: "brand-new", name: "新设备", ip: "1.1.1.1" });
    const row = rows.find(r => r.deviceId === "brand-new")!;
    expect(row.expiresAt.getTime()).toBeGreaterThanOrEqual(Date.now() + (TRUST_DAYS - 0.01) * 86_400_000);
  });

  test("verifyTrustedDevice:有效 true;过期 false;不属于该 uid false;未知 deviceId false", async () => {
    expect(await verifyTrustedDevice("dev-live", 1)).toBe(true);
    expect(await verifyTrustedDevice("dev-expired", 1)).toBe(false);
    expect(await verifyTrustedDevice("dev-live", 99)).toBe(false);
    expect(await verifyTrustedDevice("no-such", 1)).toBe(false);
    expect(await verifyTrustedDevice("", 1)).toBe(false);
  });

  test("listTrustedDevices 只列本人", async () => {
    expect(await listTrustedDevices(1)).toHaveLength(2);
    expect(await listTrustedDevices(2)).toHaveLength(0);
  });

  test("revoke/rename 仅限本人(id+uid 双条件)", async () => {
    expect(await revokeTrustedDevice(1, 1)).toBe(1);
    expect(await revokeTrustedDevice(1, 1)).toBe(0);
    expect(await renameTrustedDevice(2, 1, "乙改")).toBe(1);
    expect(await renameTrustedDevice(2, 99, "x")).toBe(0);
  });
});
