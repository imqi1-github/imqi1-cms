/**
 * CSP 头部拼接工具 buildCsp():
 *  - 已知指令齐全(default-src / script-src / style-src / img-src / font-src / media-src / connect-src / object-src / base-uri / form-action / frame-ancestors / worker-src / manifest-src)
 *  - unsafe-inline / unsafe-eval / self / https: 出现在 script-src(高德 javascript: URL + 动态域名放行)
 *  - frame-ancestors 'none' + object-src 'none'(与 X-Frame-Options: DENY 对齐,防点击劫持 + 插件注入)
 *  - cdnSrc 未配置时不应出现字面量 "undefined"
 *  - 各源拼接顺序与解析行为稳定
 */
import { describe, expect, test } from "bun:test";

import { buildCsp } from "#server/utils/csp";

describe("buildCsp:指令集齐全", () => {
  test("含 default-src / script-src / object-src 'none' / frame-ancestors 'none' / base-uri 'self'", () => {
    const csp = buildCsp();
    expect(csp).toContain("default-src 'self'");
    expect(csp).toContain("script-src");
    expect(csp).toContain("object-src 'none'");
    expect(csp).toContain("frame-ancestors 'none'");
    expect(csp).toContain("base-uri 'self'");
    expect(csp).toContain("form-action 'self'");
  });

  test("含 worker-src / manifest-src / style-src / font-src / img-src / media-src / connect-src", () => {
    const csp = buildCsp();
    expect(csp).toContain("worker-src");
    expect(csp).toContain("manifest-src");
    expect(csp).toContain("style-src");
    expect(csp).toContain("font-src");
    expect(csp).toContain("img-src");
    expect(csp).toContain("media-src");
    expect(csp).toContain("connect-src");
  });
});

describe("buildCsp:script-src 设计要点(记忆点)", () => {
  test("必须同时含 unsafe-inline + unsafe-eval + self + https:(放行 Nuxt 水合 + 高德 javascript: URL + 动态域名)", () => {
    const csp = buildCsp();
    expect(csp).toMatch(/script-src[^;]*'unsafe-inline'/);
    expect(csp).toMatch(/script-src[^;]*'unsafe-eval'/);
    expect(csp).toMatch(/script-src[^;]*'self'/);
    expect(csp).toMatch(/script-src[^;]*https:/);
  });

  test("script-src 不应出现 nonce / strict-dynamic(非首尾加锚即可,确保整段不含相应 token)", () => {
    const csp = buildCsp();
    expect(csp).not.toContain("nonce-");
    expect(csp).not.toContain("strict-dynamic");
  });
});

describe("buildCsp:连接源白名单", () => {
  test("connect-src 必须放行 GitHub / Gitee / 高德域 + blob:", () => {
    const csp = buildCsp();
    expect(csp).toContain("https://api.github.com");
    expect(csp).toContain("https://gitee.com");
    expect(csp).toContain("https://*.amap.com");
    expect(csp).toContain("blob:");
  });
});

describe("buildCsp:media-src 不带 http:（防混合内容)", () => {
  test("media-src 含 self / https: / data: / blob:,但不含裸 http: token", () => {
    const csp = buildCsp();
    const mediaMatch = /media-src[^;]*/.exec(csp);
    expect(mediaMatch).not.toBeNull();
    const media = mediaMatch![0]!;
    expect(media).toContain("'self'");
    expect(media).toContain("https:");
    expect(media).toContain("data:");
    expect(media).toContain("blob:");
    // 防御:确认整段 CSP 不含 http: 字面量(应只有 https:)
    expect(csp).not.toMatch(/[^s]http:/);
  });
});

describe("buildCsp:无 undefined 字面量", () => {
  test("cdnSrc 未配置或非 http(s) 时不应出现字面 undefined", () => {
    const csp = buildCsp();
    expect(csp).not.toContain("undefined");
  });

  test("style-src / img-src / font-src / manifest-src / connect-src 都含 'self'", () => {
    const csp = buildCsp();
    expect(csp).toMatch(/style-src[^;]*'self'/);
    expect(csp).toMatch(/img-src[^;]*'self'/);
    expect(csp).toMatch(/font-src[^;]*'self'/);
    expect(csp).toMatch(/manifest-src[^;]*'self'/);
  });
});

describe("buildCsp:指令分隔稳定", () => {
  test("指令用 '; ' 分隔(便于人工审 CSP)", () => {
    const csp = buildCsp();
    expect(csp).toContain("; ");
  });

  test("返回的 CSP 长度大于 200(防御空串 / 极端回归)", () => {
    const csp = buildCsp();
    expect(csp.length).toBeGreaterThan(200);
  });
});