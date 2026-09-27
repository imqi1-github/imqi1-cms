import { describe, expect, test } from "bun:test";

import { CSRF_TOKEN, callAdmin, loginSessionCookie } from "#test/helpers/admin";
import { mockSharedPrisma, sharedFake } from "#test/helpers/fake-prisma";

mockSharedPrisma();

const handler = (await import("#server/api/admin/changelogs/import.post")).default;

describe("admin/changelogs/import.post(导入更新日志)", () => {
  test("未登录 → 401", async () => {
    await expect(callAdmin(handler, {
      method: "POST",
      body: { csrfToken: CSRF_TOKEN, source: "[]" },
      cookie: "csrf_token=" + CSRF_TOKEN,
    })).rejects.toMatchObject({ statusCode: 401 });
  });

  test("CSRF 缺失 → 403", async () => {
    const cookie = await loginSessionCookie();
    await expect(callAdmin(handler, {
      method: "POST",
      cookie,
      body: { source: "[]" },
    })).rejects.toMatchObject({ statusCode: 403 });
  });

  test("source 缺省/空字符串 → 400", async () => {
    const cookie = await loginSessionCookie();
    await expect(callAdmin(handler, {
      method: "POST",
      cookie: cookie + "; csrf_token=" + CSRF_TOKEN,
      body: { csrfToken: CSRF_TOKEN },
    })).rejects.toMatchObject({ statusCode: 400 });
    await expect(callAdmin(handler, {
      method: "POST",
      cookie: cookie + "; csrf_token=" + CSRF_TOKEN,
      body: { csrfToken: CSRF_TOKEN, source: "   " },
    })).rejects.toMatchObject({ statusCode: 400 });
  });

  test("source 非字符串(数字)→ 400", async () => {
    const cookie = await loginSessionCookie();
    await expect(callAdmin(handler, {
      method: "POST",
      cookie: cookie + "; csrf_token=" + CSRF_TOKEN,
      body: { csrfToken: CSRF_TOKEN, source: 123 },
    })).rejects.toMatchObject({ statusCode: 400 });
  });

  test("source 非合法 JSON → 400", async () => {
    const cookie = await loginSessionCookie();
    await expect(callAdmin(handler, {
      method: "POST",
      cookie: cookie + "; csrf_token=" + CSRF_TOKEN,
      body: { csrfToken: CSRF_TOKEN, source: "{not json" },
    })).rejects.toMatchObject({ statusCode: 400 });
  });

  test("JSON 不是数组也不是对象 → 400", async () => {
    const cookie = await loginSessionCookie();
    await expect(callAdmin(handler, {
      method: "POST",
      cookie: cookie + "; csrf_token=" + CSRF_TOKEN,
      body: { csrfToken: CSRF_TOKEN, source: '"just a string"' },
    })).rejects.toMatchObject({ statusCode: 400 });
  });

  test("对象缺 entries → 400", async () => {
    const cookie = await loginSessionCookie();
    await expect(callAdmin(handler, {
      method: "POST",
      cookie: cookie + "; csrf_token=" + CSRF_TOKEN,
      body: { csrfToken: CSRF_TOKEN, source: '{"foo": "bar"}' },
    })).rejects.toMatchObject({ statusCode: 400 });
  });

  test("单条记录(数组形式)→ 成功导入 1 条", async () => {
    let createdCount = 0;
    sharedFake.on("changelogs", "create", async () => { createdCount++; return { id: createdCount }; });
    const cookie = await loginSessionCookie();
    const r = await callAdmin(handler, {
      method: "POST",
      cookie: cookie + "; csrf_token=" + CSRF_TOKEN,
      body: {
        csrfToken: CSRF_TOKEN,
        source: '[{"type": "修复", "value": "bug 修复"}]',
      },
    }) as { success: boolean; imported: number };
    expect(r.success).toBe(true);
    expect(r.imported).toBe(1);
  });

  test("多条记录(数组对象形式)→ 成功导入 N 条", async () => {
    let createdCount = 0;
    sharedFake.on("changelogs", "create", async () => { createdCount++; return { id: createdCount }; });
    const cookie = await loginSessionCookie();
    const r = await callAdmin(handler, {
      method: "POST",
      cookie: cookie + "; csrf_token=" + CSRF_TOKEN,
      body: {
        csrfToken: CSRF_TOKEN,
        source: '[{"entries":[{"type":"修复","value":"a"}],"createTime":"2026-01-01"},{"entries":[{"type":"新增","value":"b"}]}]',
      },
    }) as { success: boolean; imported: number };
    expect(r.success).toBe(true);
    expect(r.imported).toBe(2);
  });

  test("单个对象 { entries: [...] } 形式 → 成功", async () => {
    let createdCount = 0;
    sharedFake.on("changelogs", "create", async () => { createdCount++; return { id: createdCount }; });
    const cookie = await loginSessionCookie();
    const r = await callAdmin(handler, {
      method: "POST",
      cookie: cookie + "; csrf_token=" + CSRF_TOKEN,
      body: {
        csrfToken: CSRF_TOKEN,
        source: '{"entries":[{"type":"功能","value":"x"}]}',
      },
    }) as { success: boolean; imported: number };
    expect(r.success).toBe(true);
    expect(r.imported).toBe(1);
  });

  test("单条内容字节超限 → 400(整事务回滚)", async () => {
    sharedFake.on("changelogs", "create", async () => ({ id: 1 }));
    const cookie = await loginSessionCookie();
    const bigEntries = Array.from({ length: 1000 }, () => ({ type: "修复", value: "x".repeat(10000) }));
    await expect(callAdmin(handler, {
      method: "POST",
      cookie: cookie + "; csrf_token=" + CSRF_TOKEN,
      body: {
        csrfToken: CSRF_TOKEN,
        source: JSON.stringify(bigEntries),
      },
    })).rejects.toMatchObject({ statusCode: 400 });
  });

  test("createTime 非法字符串 → 静默回退 now(不抛)", async () => {
    sharedFake.on("changelogs", "create", async () => ({ id: 1 }));
    const cookie = await loginSessionCookie();
    const r = await callAdmin(handler, {
      method: "POST",
      cookie: cookie + "; csrf_token=" + CSRF_TOKEN,
      body: {
        csrfToken: CSRF_TOKEN,
        source: '[{"entries":[{"type":"修复","value":"x"}],"createTime":"not-a-date"}]',
      },
    }) as { success: boolean };
    expect(r.success).toBe(true);
  });

  test("entries 校验失败 → 400", async () => {
    sharedFake.on("changelogs", "create", async () => ({ id: 1 }));
    const cookie = await loginSessionCookie();
    // entries 为空 → validateChangelogData 要求 ≥1 条
    await expect(callAdmin(handler, {
      method: "POST",
      cookie: cookie + "; csrf_token=" + CSRF_TOKEN,
      body: {
        csrfToken: CSRF_TOKEN,
        source: '[]',
      },
    })).rejects.toMatchObject({ statusCode: 400 });
  });
});