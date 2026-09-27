/**
 * server/api/admin/cache/clear.post.ts 集成测:
 *  - 已有 clear/extra/noredis 三件套覆盖 happy + Redis 行为;本文件补 csrf + 边界 action
 *  - action='all' / 'search' / 'footprint' / 'preset' / 'keyword' / 非法值
 */
import { beforeEach, describe, expect, mock, test } from "bun:test";

import { CSRF_TOKEN, callAdmin, loginSessionCookie } from "#test/helpers/admin";
import { CSRF_COOKIE } from "#test/helpers/auth-fakes";
import { CSRF_HEADER } from "#shared/constants";

const invalidateMock = mock(async () => ({}));
mock.module("#server/utils/content-cache", () => ({ invalidateContentCaches: invalidateMock }));

const unlinkMock = mock(async (..._keys: string[]) => 0);
const flushdbMock = mock(async () => "OK");
const scanMock = mock(async (_cursor: string, ..._args: unknown[]) => ["0", [] as string[]]);

mock.module("#server/utils/redis", () => ({
  redis: {
    scan: scanMock,
    unlink: unlinkMock,
    flushdb: flushdbMock,
  },
}));

const handler = (await import("#server/api/admin/cache/clear.post")).default;

beforeEach(() => {
  invalidateMock.mockReset();
  scanMock.mockReset();
  unlinkMock.mockReset();
  flushdbMock.mockReset();
  scanMock.mockResolvedValue(["0", [] as string[]]);
  unlinkMock.mockResolvedValue(0);
  flushdbMock.mockResolvedValue("OK");
});

async function authedCookie(): Promise<string> {
  const session = await loginSessionCookie();
  return `${session}; ${CSRF_COOKIE}`;
}

describe("admin/cache/clear.post(缓存清理)", () => {
  test("未登录但 csrfToken 缺 → 403(CSRF check 在鉴权前,挡掉未登录请求)", async () => {
    await expect(callAdmin(handler, {
      method: "POST",
      body: { csrfToken: CSRF_TOKEN, action: "all" },
    })).rejects.toMatchObject({ statusCode: 403 });
  });

  test("CSRF 失败 → 403", async () => {
    const session = await loginSessionCookie();
    const cookie = `${session}; csrf_token=wrong-token`;
    await expect(callAdmin(handler, {
      method: "POST", cookie,
      headers: { [CSRF_HEADER]: CSRF_TOKEN },
      body: { csrfToken: CSRF_TOKEN, action: "all" },
    })).rejects.toMatchObject({ statusCode: 403 });
  });

  test("action=all → 调 flushdb,清空整个 Redis", async () => {
    const cookie = await authedCookie();
    const r = await callAdmin(handler, {
      method: "POST", cookie,
      body: { csrfToken: CSRF_TOKEN, action: "all" },
    }) as { success: boolean };
    expect(r.success).toBe(true);
    expect(flushdbMock).toHaveBeenCalled();
  });

  test("action=search → scan search:* 前缀", async () => {
    scanMock.mockResolvedValueOnce(["0", ["search:foo:type", "search:bar:type"]]);
    unlinkMock.mockResolvedValueOnce(2);
    const cookie = await authedCookie();
    const r = await callAdmin(handler, {
      method: "POST", cookie,
      body: { csrfToken: CSRF_TOKEN, action: "search" },
    }) as { success: boolean; cleared: number };
    expect(r.success).toBe(true);
    expect(r.cleared).toBe(2);
  });

  test("action=preset + value=search 模式 → scanAndUnlink 命中", async () => {
    scanMock.mockResolvedValueOnce(["0", ["search:1:type"]]);
    unlinkMock.mockResolvedValueOnce(1);
    const cookie = await authedCookie();
    const r = await callAdmin(handler, {
      method: "POST", cookie,
      body: { csrfToken: CSRF_TOKEN, action: "preset", value: "search" },
    }) as { success: boolean; cleared: number };
    expect(r.success).toBe(true);
    expect(r.cleared).toBe(1);
  });

  test("action=keyword + value=foo → scanAndUnlink *foo*", async () => {
    scanMock.mockResolvedValueOnce(["0", ["k:v:foo:x"]]);
    unlinkMock.mockResolvedValueOnce(1);
    const cookie = await authedCookie();
    const r = await callAdmin(handler, {
      method: "POST", cookie,
      body: { csrfToken: CSRF_TOKEN, action: "keyword", value: "foo" },
    }) as { success: boolean };
    expect(r.success).toBe(true);
  });

  test("action=preset + value 非字符串 → 400", async () => {
    const cookie = await authedCookie();
    await expect(callAdmin(handler, {
      method: "POST", cookie,
      body: { csrfToken: CSRF_TOKEN, action: "preset", value: 123 },
    })).rejects.toMatchObject({ statusCode: 400, message: "未知的缓存类别" });
  });

  test("action 缺/非法 → 400 未知的操作类型", async () => {
    const cookie = await authedCookie();
    await expect(callAdmin(handler, {
      method: "POST", cookie,
      body: { csrfToken: CSRF_TOKEN },
    })).rejects.toMatchObject({ statusCode: 400, message: "未知的操作类型" });
    await expect(callAdmin(handler, {
      method: "POST", cookie,
      body: { csrfToken: CSRF_TOKEN, action: "evil" },
    })).rejects.toMatchObject({ statusCode: 400 });
  });
});