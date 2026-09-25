import "#test/helpers/nitro-globals";

import { afterAll, describe, expect, test } from "bun:test";

import { ensureCsrfToken, generateCsrfToken, getStoredCsrfToken, setCsrfToken, validateCsrfToken } from "#server/utils/csrf";

const ORIGINAL_NODE_ENV = process.env.NODE_ENV;

afterAll(() => {
  process.env.NODE_ENV = ORIGINAL_NODE_ENV;
});

// 带 cookie 读写能力的假 event(h3 setCookie/getCookie 走 req.headers.cookie 与 res)
function makeEvent(cookie?: string) {
  const setCookies: string[] = [];
  const event = {
    node: {
      req: { headers: (cookie ? { cookie } : {}) as Record<string, string> },
      res: {
        setHeader(name: string, value: unknown) {
          if (String(name).toLowerCase() === "set-cookie") setCookies.push(String(value));
        },
        getHeader: () => setCookies,
        getHeaders: () => ({}),
      },
    },
  };
  return { event, setCookies };
}

describe("generateCsrfToken", () => {
  test("每次生成互不相同,base64url 字符集", () => {
    const a = generateCsrfToken();
    const b = generateCsrfToken();
    expect(a).not.toBe(b);
    expect(a).toMatch(/^[A-Za-z0-9_-]+$/);
    expect(a.length).toBeGreaterThanOrEqual(40);
  });
});

describe("setCsrfToken / getStoredCsrfToken", () => {
  test("种 cookie(httpOnly=false 供前端读、SameSite=Strict)并可读回", () => {
    const { event, setCookies } = makeEvent();
    const token = setCsrfToken(event as never);
    const cookie = setCookies.join(";");
    expect(cookie).toContain("csrf_token=");
    expect(cookie).toContain("SameSite=Strict");
    expect(cookie).not.toContain("HttpOnly");
    expect(getStoredCsrfToken(makeEvent(`csrf_token=${token}`).event as never)).toBe(token);
  });

  test("无 cookie 返回 null", () => {
    expect(getStoredCsrfToken(makeEvent().event as never)).toBeNull();
  });

  test("生产环境 cookie 带 Secure", () => {
    process.env.NODE_ENV = "production";
    const { event, setCookies } = makeEvent();
    setCsrfToken(event as never);
    expect(setCookies.join(";")).toContain("Secure");
    process.env.NODE_ENV = ORIGINAL_NODE_ENV;
  });
});

describe("validateCsrfToken(double-submit)", () => {
  test("与 cookie 一致 → true;不一致/缺失 → false", () => {
    const { event } = makeEvent();
    const token = setCsrfToken(event as never);
    const withCookie = (provided?: string) => validateCsrfToken(makeEvent(`csrf_token=${token}`).event as never, provided);
    expect(withCookie(token)).toBe(true);
    expect(withCookie("wrong")).toBe(false);
    expect(withCookie(undefined)).toBe(false);
  });

  test("cookie 不存在 → false(即使提供了 token)", () => {
    expect(validateCsrfToken(makeEvent().event as never, "any")).toBe(false);
  });

  test("长度不同的 token 也安全判 false(不抛 timingSafeEqual 长度错)", () => {
    const { event } = makeEvent();
    const token = setCsrfToken(event as never);
    expect(() => validateCsrfToken(makeEvent(`csrf_token=${token}`).event as never, "short")).not.toThrow();
  });
});

describe("ensureCsrfToken", () => {
  test("已有 cookie 时复用不重发;无 cookie 时新建并种下", () => {
    const existing = makeEvent("csrf_token=existing-token-value");
    expect(ensureCsrfToken(existing.event as never)).toBe("existing-token-value");
    expect(existing.setCookies).toHaveLength(0);

    const fresh = makeEvent();
    const created = ensureCsrfToken(fresh.event as never);
    expect(created).toBeTruthy();
    expect(fresh.setCookies.join(";")).toContain(`csrf_token=${created}`);
  });
});
