import "#test/helpers/nitro-globals";

import { beforeEach, describe, expect, test } from "bun:test";

import { CSRF_COOKIE, CSRF_TOKEN, callAdmin, loginSessionCookie } from "#test/helpers/admin";
import { mockSharedPrisma, sharedFake } from "#test/helpers/fake-prisma";

mockSharedPrisma();

// informations 内存表(key→value),支持 upsert/findMany
let infos = new Map<string, string>();
sharedFake.on("informations", "upsert", async ({ where, create, update }: { where: { key: string }; create: { key: string; value: string }; update: { value: string } }) => {
  infos.set(where.key, update.value);
  return { key: where.key, value: create.value };
});
sharedFake.on("informations", "findMany", async () => [...infos.entries()].map(([key, value]) => ({ key, value })));
sharedFake.on("informations", "findUnique", async ({ where }: { where: { key: string } }) =>
  infos.has(where.key) ? { key: where.key, value: infos.get(where.key)! } : null);

const getHandler = (await import("#server/api/admin/settings.get")).default;
const postHandler = (await import("#server/api/admin/settings.post")).default;

async function cookie(): Promise<string> {
  return `${await loginSessionCookie()}; ${CSRF_COOKIE}`;
}

beforeEach(() => {
  infos = new Map();
});

describe("admin/settings", () => {
  test("未登录 GET → 401;POST 无 CSRF → 403(先于登录判定)", async () => {
    await expect(callAdmin(getHandler, {})).rejects.toMatchObject({ statusCode: 401 });
    const session = await loginSessionCookie();
    await expect(callAdmin(postHandler, { cookie: session, body: { siteName: "x" } })).rejects.toMatchObject({ statusCode: 403 });
  });

  test("POST 非标量值 → 400 格式错误", async () => {
    const c = await cookie();
    await expect(callAdmin(postHandler, { cookie: c, body: { siteName: { nested: true }, csrfToken: CSRF_TOKEN } })).rejects.toMatchObject({ statusCode: 400 });
  });

  test("POST 超长值 → 400(validateSettingsData)", async () => {
    const c = await cookie();
    await expect(callAdmin(postHandler, { cookie: c, body: { siteName: "长".repeat(101), csrfToken: CSRF_TOKEN } })).rejects.toMatchObject({ statusCode: 400 });
  });

  test("POST 保存后 GET 读回;布尔/数字以字符串入库", async () => {
    const c = await cookie();
    await expect(callAdmin(postHandler, { cookie: c, body: { siteName: "新站名", commentEnabled: false, contentPageSize: 25, csrfToken: CSRF_TOKEN } })).resolves.toEqual({ success: true });

    expect(infos.get("siteName")).toBe("新站名");
    expect(infos.get("commentEnabled")).toBe("false");
    expect(infos.get("contentPageSize")).toBe("25");

    const list = (await callAdmin(getHandler, { method: "GET", cookie: await loginSessionCookie() })) as Record<string, unknown>;
    expect(list.siteName).toBe("新站名");
    // GET 按 defaults 类型反序列化:布尔/数字转回原类型
    expect(list.commentEnabled).toBe(false);
    expect(list.contentPageSize).toBe(25);
  });

  test("POST 未传的键回落默认值(整批 upsert 语义)", async () => {
    const c = await cookie();
    await callAdmin(postHandler, { cookie: c, body: { csrfToken: CSRF_TOKEN } });
    expect(infos.get("commentEnabled")).toBe("true");
    expect(infos.get("commentModeration")).toBe("false");
    expect(typeof infos.get("smtpPort")).toBe("string");
  });
});
