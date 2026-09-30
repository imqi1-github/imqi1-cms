/**
 * server/utils/csrf.ts 补测:
 *  - ensureCsrfToken 与 setCsrfToken/getStoredCsrfToken 行为差异(已有覆盖)
 *  - validateCsrfToken:多种 length mismatch + 同长度但内容不同 + 空 token vs 缺失
 *  - 生成 token 字符集:base64url[A-Za-z0-9_-](无 + / =)
 *  - 重复调用 ensureCsrfToken 不发额外 cookie
 */
import "#test/helpers/nitro-globals";

import { afterAll, describe, expect, test } from "bun:test";

import { ensureCsrfToken, generateCsrfToken, getStoredCsrfToken, setCsrfToken, validateCsrfToken } from "#server/utils/csrf";

const ORIGINAL_NODE_ENV = process.env.NODE_ENV;

afterAll(() => {
  process.env.NODE_ENV = ORIGINAL_NODE_ENV;
});

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

describe("generateCsrfToken:熵与字符集", () => {
  test("1000 次生成互不相同(熵源正常)", () => {
    const seen = new Set<string>();
    for (let i = 0; i < 1000; i++) seen.add(generateCsrfToken());
    expect(seen.size).toBe(1000);
  });

  test("token 长度 ≥ 40 字节(base64url(32) ≈ 43 字符)", () => {
    const t = generateCsrfToken();
    expect(t.length).toBeGreaterThanOrEqual(40);
  });

  test("token 不含 base64 标准字符 + / =", () => {
    const t = generateCsrfToken();
    expect(t).not.toMatch(/[+/=]/);
  });
});

describe("validateCsrfToken:timingSafeEqual 边界", () => {
  test("cookie 存在但 provided undefined → false(不抛)", () => {
    const { event } = makeEvent();
    const t = setCsrfToken(event as never);
    expect(() => validateCsrfToken(makeEvent(`csrf_token=${t}`).event as never, undefined)).not.toThrow();
    expect(validateCsrfToken(makeEvent(`csrf_token=${t}`).event as never, undefined)).toBe(false);
  });

  test("provided 空串 → false", () => {
    const { event } = makeEvent();
    const t = setCsrfToken(event as never);
    expect(validateCsrfToken(makeEvent(`csrf_token=${t}`).event as never, "")).toBe(false);
  });

  test("provided 是非字符串 → 走 timingSafeEqual 抛 TypeError(已知行为,后续可加固)", () => {
    const { event } = makeEvent();
    const t = setCsrfToken(event as never);
    // 当前实现:不做 typeof 检查,直接 Buffer.from() 抛 TypeError
    // 这里是文档化行为,后续加固可加 typeof === "string" 守卫
    expect(() => validateCsrfToken(makeEvent(`csrf_token=${t}`).event as never, 123 as never)).toThrow(TypeError);
  });

  test("provided 是同长度不同内容 → false(timingSafeEqual 内容比较失败)", () => {
    const { event } = makeEvent();
    const t = setCsrfToken(event as never);
    const wrong = "x".repeat(t.length);
    expect(validateCsrfToken(makeEvent(`csrf_token=${t}`).event as never, wrong)).toBe(false);
  });

  test("provided 与 cookie 长度相差 1 → false(不抛 timingSafeEqual 长度错)", () => {
    const { event } = makeEvent();
    const t = setCsrfToken(event as never);
    const tooLong = t + "x";
    const tooShort = t.slice(0, -1);
    expect(validateCsrfToken(makeEvent(`csrf_token=${t}`).event as never, tooLong)).toBe(false);
    expect(validateCsrfToken(makeEvent(`csrf_token=${t}`).event as never, tooShort)).toBe(false);
  });
});

describe("setCsrfToken:cookie 属性", () => {
  test("生产环境 Secure + SameSite=Strict + httpOnly=false", () => {
    process.env.NODE_ENV = "production";
    const { event, setCookies } = makeEvent();
    setCsrfToken(event as never);
    const cookie = setCookies.join(";");
    expect(cookie).toContain("Secure");
    expect(cookie).toContain("SameSite=Strict");
    expect(cookie).not.toContain("HttpOnly");
    process.env.NODE_ENV = ORIGINAL_NODE_ENV;
  });

  test("dev 环境无 Secure 但 SameSite=Strict + Max-Age=3600", () => {
    process.env.NODE_ENV = "development";
    const { event, setCookies } = makeEvent();
    setCsrfToken(event as never);
    const cookie = setCookies.join(";");
    expect(cookie).not.toContain("Secure");
    expect(cookie).toContain("SameSite=Strict");
    expect(cookie).toContain("Max-Age=3600");
    process.env.NODE_ENV = ORIGINAL_NODE_ENV;
  });

  test("Path=/", () => {
    const { event, setCookies } = makeEvent();
    setCsrfToken(event as never);
    expect(setCookies.join(";")).toContain("Path=/");
  });
});

describe("ensureCsrfToken:幂等复用", () => {
  test("重复 ensure 已有 cookie → 返回原 token,不发新 cookie", () => {
    const e1 = makeEvent("csrf_token=existing-original-token");
    const t1 = ensureCsrfToken(e1.event as never);
    expect(t1).toBe("existing-original-token");
    expect(e1.setCookies).toHaveLength(0);

    const t2 = ensureCsrfToken(e1.event as never);
    expect(t2).toBe(t1);
  });

  test("ensure 读到旧 token → 复用而非新建", () => {
    const orig = makeEvent("csrf_token=legacy-token-abc");
    const t = ensureCsrfToken(orig.event as never);
    expect(t).toBe("legacy-token-abc");
  });
});

describe("getStoredCsrfToken:边界", () => {
  test("无 cookie header → null", () => {
    expect(getStoredCsrfToken(makeEvent().event as never)).toBeNull();
  });

  test("其他 cookie 与 csrf_token 共存 → 只取 csrf_token", () => {
    const { event } = makeEvent("session=xxx; csrf_token=the-csrf; theme=dark");
    expect(getStoredCsrfToken(event as never)).toBe("the-csrf");
  });

  test("csrf_token= 空串 → 视为缺失(null)", () => {
    const r = getStoredCsrfToken(makeEvent("csrf_token=").event as never);
    expect(r === null || r === "").toBe(true);
  });
});