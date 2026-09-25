import "#test/helpers/nitro-globals";

import { beforeEach, describe, expect, test } from "bun:test";

import { defaultTrustedDeviceSeed, resetTrustedDevices } from "#test/helpers/auth-fakes";

// trusted_devices 假件统一在 auth-fakes 注册(全仓唯一注册点),这里只复位种子
beforeEach(() => resetTrustedDevices(defaultTrustedDeviceSeed()));

const {
  createTrustedDevice,
  verifyTrustedDevice,
  listTrustedDevices,
  revokeTrustedDevice,
  renameTrustedDevice,
  TRUST_DAYS,
} = await import("#server/utils/trusted-device");

describe("trusted-device(prisma 假件)", () => {
  test("createTrustedDevice 后该设备可信,有效期为 30 天", async () => {
    await createTrustedDevice({ userId: 1, deviceId: "brand-new", name: "新设备", ip: "1.1.1.1" });
    expect(await verifyTrustedDevice("brand-new", 1)).toBe(true);
    expect(TRUST_DAYS).toBe(30);
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
