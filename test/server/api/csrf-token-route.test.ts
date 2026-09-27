/**
 * csrf/token.get.ts 路由层断言(util 已在 csrf.test.ts 测过)
 *  - 响应头: Cache-Control: no-store(per-user 敏感数据禁缓存)
 *  - 响应形状: { code: 200, data: { token } }
 *  - cookie 存在 → 复用;缺失 → 新生成(并 setCookie)
 */
import "#test/helpers/nitro-globals";

import { describe, expect, mock, test } from "bun:test";

// 模拟真 csrf util 行为(cookie 存在则复用,缺失则 setCookie 生成)
// 避免被其它测试 mock 污染;真 csrf util 行为由 csrf.test.ts 覆盖
const MOCK_TOKEN = "a".repeat(43);
mock.module("#server/utils/csrf", () => ({
  ensureCsrfToken: (event: { node: { req: { headers: Record<string, string> }; res: { setHeader: (n: string, v: string) => void } } }) => {
    const cookieHeader = event.node.req.headers.cookie ?? "";
    const match = cookieHeader.match(/csrf_token=([^;]+)/);
    if (match) return match[1]!;
    event.node.res.setHeader("set-cookie", `csrf_token=${MOCK_TOKEN}; Path=/; SameSite=Strict`);
    return MOCK_TOKEN;
  },
  getStoredCsrfToken: () => MOCK_TOKEN,
  setCsrfToken: () => MOCK_TOKEN,
  generateCsrfToken: () => MOCK_TOKEN,
  validateCsrfToken: () => true,
}));

const { default: tokenHandler } = await import("#server/api/csrf/token.get");

const setCookies: string[] = [];
const respHeaders: string[] = [];

function makeEvent(cookie?: string) {
  setCookies.length = 0;
  respHeaders.length = 0;
  return {
    node: {
      req: { headers: (cookie ? { cookie } : {}) as Record<string, string> },
      res: {
        setHeader(name: string, value: unknown) {
          const key = String(name).toLowerCase();
          if (key === "set-cookie") setCookies.push(String(value));
          else respHeaders.push(`${String(name)}: ${String(value)}`);
        },
        getHeader: (name: string) => {
          if (String(name).toLowerCase() === "set-cookie") return setCookies;
          return undefined;
        },
        getHeaders: () => ({}),
      },
    },
  };
}

describe("csrf/token.get.ts 路由", () => {
  test("响应头: Cache-Control: no-store(禁止任何缓存)", () => {
    const event = makeEvent();
    tokenHandler(event as never);
    const cacheControl = respHeaders.find(h => h.toLowerCase().startsWith("cache-control:"));
    expect(cacheControl).toBeDefined();
    expect(cacheControl!.toLowerCase()).toContain("no-store");
  });

  test("响应形状: { code: 200, data: { token } }", () => {
    const event = makeEvent();
    const res = tokenHandler(event as never) as { code: number; data: { token: string } };
    expect(res.code).toBe(200);
    expect(typeof res.data.token).toBe("string");
    expect(res.data.token.length).toBeGreaterThanOrEqual(40);
    // base64url 字符集(无 +/=,只能 A-Z a-z 0-9 _ -)
    expect(res.data.token).toMatch(/^[A-Za-z0-9_-]+$/);
  });

  test("cookie 已存在 csrf_token → 复用,不发新 setCookie", () => {
    const existing = "abc12345".repeat(5); // 45 chars, base64url-safe
    const event = makeEvent(`csrf_token=${existing}`);
    const res = tokenHandler(event as never) as { data: { token: string } };
    expect(res.data.token).toBe(existing);
    // 无新 cookie 写
    expect(setCookies.filter(c => c.startsWith("csrf_token="))).toHaveLength(0);
  });

  test("cookie 缺失 → 调 setCookie 生成并下发 csrf_token", () => {
    const event = makeEvent();
    const res = tokenHandler(event as never) as { data: { token: string } };
    // 应下发 Set-Cookie
    const csrfSetCookie = setCookies.find(c => c.startsWith("csrf_token="));
    expect(csrfSetCookie).toBeDefined();
    // 返回的 token 与 cookie 里的值一致
    const cookieVal = csrfSetCookie!.split(";")[0]!.slice("csrf_token=".length);
    expect(res.data.token).toBe(cookieVal);
  });

  test("无任何 cookie 头 → 走 setCookie 分支,响应形状正常", () => {
    const event = makeEvent();
    const res = tokenHandler(event as never) as { code: number; data: { token: string } };
    expect(res.code).toBe(200);
    expect(res.data.token).toMatch(/^[A-Za-z0-9_-]+$/);
    expect(setCookies.length).toBeGreaterThan(0);
  });
});