import { beforeEach, describe, expect, test } from "bun:test";

import { CSRF_COOKIE, CSRF_TOKEN, callAdmin, loginSessionCookie } from "#test/helpers/admin";
import { CSRF_HEADER } from "#shared/constants";

const fakePrisma = await import("#test/helpers/fake-prisma");

// ===== trusted_devices 假件 =====
const trustedDeviceRows: Array<Record<string, unknown>> = [];
trustedDeviceRows.push({ id: 1, userId: 1, name: "iPhone" });
trustedDeviceRows.push({ id: 2, userId: 1, name: null });

fakePrisma.sharedFake.on("trusted_devices", "deleteMany", async ({ where }: { where: { id: number; userId: number } }) => {
  const before = trustedDeviceRows.length;
  for (let i = trustedDeviceRows.length - 1; i >= 0; i--) {
    if (trustedDeviceRows[i]!.id === where.id && trustedDeviceRows[i]!.userId === where.userId) {
      trustedDeviceRows.splice(i, 1);
    }
  }
  return { count: before - trustedDeviceRows.length };
});
fakePrisma.sharedFake.on("trusted_devices", "updateMany", async ({ where, data }: { where: { id: number; userId: number }, data: Record<string, unknown> }) => {
  let count = 0;
  for (const r of trustedDeviceRows) {
    if (r.id === where.id && r.userId === where.userId) {
      Object.assign(r, data);
      count++;
    }
  }
  return { count };
});

// ===== handlers =====
const deviceDeleteHandler = (await import("#server/api/admin/2fa/devices/[id].delete")).default;
const devicePutHandler = (await import("#server/api/admin/2fa/devices/[id].put")).default;
const attachmentPatchHandler = (await import("#server/api/admin/attachments/[id].patch")).default;

// ===== attachments 假件 =====
const attachmentRows: Array<Record<string, unknown>> = [];
attachmentRows.push({ aid: 1, title: "原", type: "image", url: "https://x.com/a.jpg" });
attachmentRows.push({ aid: 2, title: "原2", type: "image", url: "https://x.com/b.jpg" });

const attachmentUpdates: Array<{ aid: number, data: Record<string, unknown> }> = [];
const attachmentrelationCreates: Array<Record<string, unknown>> = [];
const attachmentrelationDeletes: Array<Record<string, unknown>> = [];

fakePrisma.sharedFake.on("attachments", "findUnique", async ({ where }: { where: { aid: number } }) =>
  attachmentRows.find(a => a.aid === where.aid) ?? null);
fakePrisma.sharedFake.on("attachments", "update", async ({ where, data }: { where: { aid: number }, data: Record<string, unknown> }) => {
  const row = attachmentRows.find(a => a.aid === where.aid);
  if (!row) throw Object.assign(new Error("P2025"), { code: "P2025" });
  attachmentUpdates.push({ aid: where.aid, data });
  Object.assign(row, data);
  return { ...row };
});
fakePrisma.sharedFake.on("contentattachments", "createMany", async ({ data }: { data: Array<Record<string, unknown>> }) => {
  attachmentrelationCreates.push(...data);
  return { count: data.length };
});
fakePrisma.sharedFake.on("contentattachments", "deleteMany", async ({ where }: { where: Record<string, unknown> }) => {
  attachmentrelationDeletes.push(where);
  return { count: 1 };
});

async function cookie() {
  return `${await loginSessionCookie()}; ${CSRF_COOKIE}`;
}

beforeEach(() => {
  trustedDeviceRows.length = 0;
  trustedDeviceRows.push({ id: 1, userId: 1, name: "iPhone" });
  trustedDeviceRows.push({ id: 2, userId: 1, name: null });
  attachmentRows.length = 0;
  attachmentRows.push({ aid: 1, title: "原", type: "image", url: "https://x.com/a.jpg" });
  attachmentRows.push({ aid: 2, title: "原2", type: "image", url: "https://x.com/b.jpg" });
  attachmentUpdates.length = 0;
  attachmentrelationCreates.length = 0;
  attachmentrelationDeletes.length = 0;
});

describe("2fa/devices/[id].delete(撤回设备)", () => {
  test("未登录 → 401", async () => {
    await expect(callAdmin(deviceDeleteHandler, {
      method: "DELETE",
      params: { id: "1" },
      cookie: CSRF_COOKIE,
      headers: { [CSRF_HEADER]: CSRF_TOKEN },
    })).rejects.toMatchObject({ statusCode: 401 });
  });

  test("CSRF header 缺失 → 403", async () => {
    await expect(callAdmin(deviceDeleteHandler, {
      method: "DELETE",
      params: { id: "1" },
      cookie: await cookie(),
    })).rejects.toMatchObject({ statusCode: 403 });
  });

  test("非法 id → 400", async () => {
    await expect(callAdmin(deviceDeleteHandler, {
      method: "DELETE",
      params: { id: "abc" },
      cookie: await cookie(),
      headers: { [CSRF_HEADER]: CSRF_TOKEN },
    })).rejects.toMatchObject({ statusCode: 400 });
  });

  test("设备不存在 → 404", async () => {
    await expect(callAdmin(deviceDeleteHandler, {
      method: "DELETE",
      params: { id: "999" },
      cookie: await cookie(),
      headers: { [CSRF_HEADER]: CSRF_TOKEN },
    })).rejects.toMatchObject({ statusCode: 404 });
  });

  test("成功撤回", async () => {
    const r = await callAdmin(deviceDeleteHandler, {
      method: "DELETE",
      params: { id: "1" },
      cookie: await cookie(),
      headers: { [CSRF_HEADER]: CSRF_TOKEN },
    }) as { success: boolean };
    expect(r.success).toBe(true);
    expect(trustedDeviceRows).toHaveLength(1);
  });
});

describe("2fa/devices/[id].put(重命名设备)", () => {
  test("未登录 → 401", async () => {
    await expect(callAdmin(devicePutHandler, {
      method: "PUT",
      params: { id: "1" },
      cookie: CSRF_COOKIE,
      body: { name: "x", csrfToken: CSRF_TOKEN },
    })).rejects.toMatchObject({ statusCode: 401 });
  });

  test("CSRF 缺失 → 403", async () => {
    await expect(callAdmin(devicePutHandler, {
      method: "PUT",
      params: { id: "1" },
      body: { name: "x" },
      cookie: await cookie(),
    })).rejects.toMatchObject({ statusCode: 403 });
  });

  test("非法 id → 400", async () => {
    await expect(callAdmin(devicePutHandler, {
      method: "PUT",
      params: { id: "abc" },
      body: { name: "x", csrfToken: CSRF_TOKEN },
      cookie: await cookie(),
    })).rejects.toMatchObject({ statusCode: 400 });
  });

  test("name 超长 → 400", async () => {
    await expect(callAdmin(devicePutHandler, {
      method: "PUT",
      params: { id: "1" },
      body: { name: "x".repeat(200), csrfToken: CSRF_TOKEN },
      cookie: await cookie(),
    })).rejects.toThrow(/过长/);
  });

  test("name 非字符串 → 400", async () => {
    await expect(callAdmin(devicePutHandler, {
      method: "PUT",
      params: { id: "1" },
      body: { name: 123, csrfToken: CSRF_TOKEN },
      cookie: await cookie(),
    })).rejects.toThrow(/不正确/);
  });

  test("设备不存在 → 404", async () => {
    await expect(callAdmin(devicePutHandler, {
      method: "PUT",
      params: { id: "999" },
      body: { name: "x", csrfToken: CSRF_TOKEN },
      cookie: await cookie(),
    })).rejects.toMatchObject({ statusCode: 404 });
  });

  test("成功重命名", async () => {
    const r = await callAdmin(devicePutHandler, {
      method: "PUT",
      params: { id: "1" },
      body: { name: "新设备名", csrfToken: CSRF_TOKEN },
      cookie: await cookie(),
    }) as { success: boolean, name: string };
    expect(r.success).toBe(true);
    expect(r.name).toBe("新设备名");
  });

  test("name 空串 → 清空(存 null)", async () => {
    const r = await callAdmin(devicePutHandler, {
      method: "PUT",
      params: { id: "1" },
      body: { name: "", csrfToken: CSRF_TOKEN },
      cookie: await cookie(),
    }) as { name: string | null };
    expect(r.name).toBeNull();
  });
});

describe("attachments/[id].patch(修改附件元数据)", () => {
  test("未登录 → 401", async () => {
    await expect(callAdmin(attachmentPatchHandler, {
      method: "PATCH",
      params: { id: "1" },
      cookie: CSRF_COOKIE,
      body: { name: "x", csrfToken: CSRF_TOKEN },
    })).rejects.toMatchObject({ statusCode: 401 });
  });

  test("CSRF 缺失 → 403", async () => {
    await expect(callAdmin(attachmentPatchHandler, {
      method: "PATCH",
      params: { id: "1" },
      body: { name: "x" },
      cookie: await cookie(),
    })).rejects.toMatchObject({ statusCode: 403 });
  });

  test("非法 id → 400", async () => {
    await expect(callAdmin(attachmentPatchHandler, {
      method: "PATCH",
      params: { id: "abc" },
      body: { name: "x", csrfToken: CSRF_TOKEN },
      cookie: await cookie(),
    })).rejects.toMatchObject({ statusCode: 400 });
  });

  test("附件不存在 → 404", async () => {
    await expect(callAdmin(attachmentPatchHandler, {
      method: "PATCH",
      params: { id: "999" },
      body: { name: "x", csrfToken: CSRF_TOKEN },
      cookie: await cookie(),
    })).rejects.toThrow();
  });

  test("name 非字符串(数字)→ 当作空串处理(不抛)", async () => {
    // 收窄:name 缺省或非字符串 → '' 不报错
    await callAdmin(attachmentPatchHandler, {
      method: "PATCH",
      params: { id: "1" },
      body: { name: 123, csrfToken: CSRF_TOKEN },
      cookie: await cookie(),
    });
    expect(attachmentUpdates[0]!.data.title).toBe("");
  });

  test("成功:仅修改 name(无 cids)", async () => {
    await callAdmin(attachmentPatchHandler, {
      method: "PATCH",
      params: { id: "1" },
      body: { name: "新名", csrfToken: CSRF_TOKEN },
      cookie: await cookie(),
    });
    expect(attachmentUpdates[0]!.data.title).toBe("新名");
    expect(attachmentrelationDeletes).toHaveLength(0);
    expect(attachmentrelationCreates).toHaveLength(0);
  });

  test("cids 非数组 → 400", async () => {
    await expect(callAdmin(attachmentPatchHandler, {
      method: "PATCH",
      params: { id: "1" },
      body: { name: "x", cids: "not array", csrfToken: CSRF_TOKEN },
      cookie: await cookie(),
    })).rejects.toThrow(/cids/);
  });

  test("cids 含非正整数 → 400(不会静默清空)", async () => {
    await expect(callAdmin(attachmentPatchHandler, {
      method: "PATCH",
      params: { id: "1" },
      body: { name: "x", cids: [1, -1, 0], csrfToken: CSRF_TOKEN },
      cookie: await cookie(),
    })).rejects.toThrow(/cids/);
  });

  test("成功:同时改 name 和 cids", async () => {
    await callAdmin(attachmentPatchHandler, {
      method: "PATCH",
      params: { id: "1" },
      body: { name: "新名", cids: [1, 2, 2], csrfToken: CSRF_TOKEN },
      cookie: await cookie(),
    });
    expect(attachmentUpdates[0]!.data.title).toBe("新名");
    expect(attachmentrelationDeletes.length).toBeGreaterThan(0);
    // 去重后 2 条
    expect(attachmentrelationCreates).toHaveLength(2);
  });
});
