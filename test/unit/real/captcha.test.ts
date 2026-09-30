// 真实 captcha 模块测试:本文件必须先于 auth-fakes 的 mock.module("#server/utils/captcha")
// 加载(目录名 real 字典序 < server,保证拿到真实现而不是 setCaptchaAccept 替身)。
// WASM 栅格化用 node_modules 内的 svg2png + server/runtime-assets 字体(开发环境均存在)。
import { describe, expect, test } from "bun:test";

const { issueCaptcha, verifyCaptcha } = await import("#server/utils/captcha");

// makeAuthEvent 的替代:这里只需要 cookie 读写,手工造最小 event(避免 import auth-fakes 反把 mock 提前注册)
function makeEvent() {
  const setCookies: string[] = [];
  const reqHeaders: Record<string, string> = {};
  const event = {
    node: {
      req: { headers: reqHeaders },
      res: {
        setHeader(name: string, value: unknown) {
          if (name.toLowerCase() === "set-cookie") setCookies.push(String(value));
        },
        getHeader(name: string) {
          return name.toLowerCase() === "set-cookie" ? setCookies : undefined;
        },
        // h3 setCookie 经 getHeader 读旧值 + setHeader 写回 Set-Cookie
        appendHeader(name: string, value: unknown) {
          if (name.toLowerCase() === "set-cookie") setCookies.push(String(value));
        },
      },
    },
  } as never;
  // h3 setCookie 实际经 setCookie → res.setHeader(合并逻辑在 h3 内部),两种都挂了即可
  return { event, setCookies, getCookieHeader: () => reqHeaders.cookie };
}

function cookieToken(setCookies: string[]): string | undefined {
  const raw = setCookies.find(c => c.startsWith("captcha_token="));
  return raw?.slice("captcha_token=".length).split(";")[0];
}

function eventWithCookie(token: string) {
  const { event } = makeEvent();
  (event as unknown as { node: { req: { headers: Record<string, string> } } }).node.req.headers.cookie = `captcha_token=${token}`;
  return event;
}

describe("captcha 真实实现(issue/verify)", () => {
  test("issueCaptcha 返回 PNG 位图并下发 httpOnly token cookie", async () => {
    const { event, setCookies } = makeEvent();
    const png = await issueCaptcha(event);
    expect(Buffer.isBuffer(png)).toBe(true);
    expect(png.subarray(0, 4)).toEqual(Buffer.from([0x89, 0x50, 0x4e, 0x47]));
    const raw = setCookies.find(c => c.startsWith("captcha_token=")) ?? "";
    expect(raw).toContain("HttpOnly");
    expect(raw).toContain("Max-Age=300");
    expect(cookieToken(setCookies)).toBeTruthy();
  });

  test("无 cookie/空输入 → 校验失败", () => {
    const { event } = makeEvent();
    expect(verifyCaptcha(event, "")).toBe(false);
    expect(verifyCaptcha(eventWithCookie("no-such-token"), "abcd")).toBe(false);
  });

  test("一次性消费:错误答案也烧掉 token,重放必失败", async () => {
    const { event, setCookies } = makeEvent();
    await issueCaptcha(event);
    const token = cookieToken(setCookies)!;
    expect(verifyCaptcha(eventWithCookie(token), "0000")).toBe(false);
    // token 已被消费:即使再试也失败(防重放/爆破)
    expect(verifyCaptcha(eventWithCookie(token), "0000")).toBe(false);
  });
});
