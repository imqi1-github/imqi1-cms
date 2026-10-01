/**
 * shared/amap-proxy.ts 集成测(纯函数,直接 import 真实现):
 *  - buildAmapProxyScriptUrl:代理脚本 URL 拼接 + plugin/callback 序列化 + basePath 归一化
 *  - buildAmapDirectScriptUrl:直连官方 + key 强制 + basePath 不影响
 *  - buildAmapServiceHost:代理服务 host 拼接
 *  - resolveAmapProxyTarget:三类上游分派 + SSRF 防御(pathname 残留段 hostname 校验)
 *    - /maps → webapi.amap.com/maps + key
 *    - /v4/map/styles → webapi.amap.com/v4/map/styles + securityJsCode
 *    - 其它 /rest → restapi.amap.com + securityJsCode
 *    - basePath 不匹配 / SSRF 改 hostname → null
 */
import { describe, expect, test } from "bun:test";

import { TEST_SITE_URL } from "#shared/constants";
import {
  AMAP_PROXY_BASE_PATH,
  buildAmapDirectScriptUrl,
  buildAmapProxyScriptUrl,
  buildAmapServiceHost,
  resolveAmapProxyTarget,
} from "#shared/amap-proxy";

describe("buildAmapProxyScriptUrl", () => {
  test("默认值 → v=2.0 + 默认 basePath", () => {
    expect(buildAmapProxyScriptUrl()).toBe("/_AMapService/maps?v=2.0");
  });

  test("version + plugins + callback 都序列化进 query", () => {
    expect(buildAmapProxyScriptUrl({
      version: "2.1", plugins: ["PlaceSearch", "ToolBar"], callback: "initAMap",
    })).toBe("/_AMapService/maps?v=2.1&plugin=PlaceSearch%2CToolBar&callback=initAMap");
  });

  test("plugins 空数组不写 plugin 键", () => {
    const url = buildAmapProxyScriptUrl({ plugins: [] });
    expect(url).not.toContain("plugin=");
  });

  test("自定义 basePath 不带前导 / → 自动补", () => {
    expect(buildAmapProxyScriptUrl({ basePath: "amap" })).toBe("/amap/maps?v=2.0");
  });

  test("basePath 尾随 / 归一化", () => {
    expect(buildAmapProxyScriptUrl({ basePath: "/amap/" })).toBe("/amap/maps?v=2.0");
    expect(buildAmapProxyScriptUrl({ basePath: "/amap//" })).toBe("/amap/maps?v=2.0");
  });

  test("basePath 是空串 → 回落默认值", () => {
    expect(buildAmapProxyScriptUrl({ basePath: "" })).toBe(`${AMAP_PROXY_BASE_PATH}/maps?v=2.0`);
  });
});

describe("buildAmapDirectScriptUrl", () => {
  test("必填 key 进 query,直连 webapi.amap.com", () => {
    expect(buildAmapDirectScriptUrl({
      key: "fake-key",
      plugins: ["PlaceSearch"],
      callback: "initAMap",
    })).toBe("https://webapi.amap.com/maps?v=2.0&key=fake-key&plugin=PlaceSearch&callback=initAMap");
  });

  test("plugins 空数组 → 不写 plugin 键", () => {
    expect(buildAmapDirectScriptUrl({ key: "k", plugins: [] }))
      .toBe("https://webapi.amap.com/maps?v=2.0&key=k");
  });
});

describe("buildAmapServiceHost", () => {
  test("origin + basePath 拼成完整 URL", () => {
    expect(buildAmapServiceHost(TEST_SITE_URL)).toBe(`${TEST_SITE_URL}/_AMapService`);
  });

  test("origin 带尾 / 时归一化", () => {
    expect(buildAmapServiceHost(`${TEST_SITE_URL}/`)).toBe(`${TEST_SITE_URL}/_AMapService`);
  });

  test("自定义 basePath(不带前导 /)→ 自动补", () => {
    expect(buildAmapServiceHost(TEST_SITE_URL, "amap")).toBe(`${TEST_SITE_URL}/amap`);
  });
});

describe("resolveAmapProxyTarget", () => {
  const key = "FAKE_KEY";
  const js = "FAKE_JS";

  test("/maps → webapi/maps + key,删除 key 重复参数后重写", () => {
    const u = resolveAmapProxyTarget({
      pathname: "/_AMapService/maps",
      search: "?key=evil&v=2.0",
      key, securityJsCode: js,
    });
    expect(u?.hostname).toBe("webapi.amap.com");
    expect(u?.pathname).toBe("/maps");
    expect(u?.searchParams.get("key")).toBe(key);
    expect(u?.searchParams.get("v")).toBe("2.0");
    expect(u?.searchParams.get("jscode")).toBeNull();
  });

  test("/v4/map/styles → webapi/v4/map/styles + securityJsCode,key 被丢弃", () => {
    const u = resolveAmapProxyTarget({
      pathname: "/_AMapService/v4/map/styles",
      search: "?key=evil&theme=dark",
      key, securityJsCode: js,
    });
    expect(u?.hostname).toBe("webapi.amap.com");
    expect(u?.pathname).toBe("/v4/map/styles");
    expect(u?.searchParams.get("theme")).toBe("dark");
    expect(u?.searchParams.get("jscode")).toBe(js);
    expect(u?.searchParams.get("key")).toBeNull();
  });

  test("其它 /rest → restapi.amap.com + securityJsCode,删 key/jscode", () => {
    const u = resolveAmapProxyTarget({
      pathname: "/_AMapService/v3/place/text",
      search: "?key=evil&keywords=foo",
      key, securityJsCode: js,
    });
    expect(u?.hostname).toBe("restapi.amap.com");
    expect(u?.pathname).toBe("/v3/place/text");
    expect(u?.searchParams.get("keywords")).toBe("foo");
    expect(u?.searchParams.get("jscode")).toBe(js);
  });

  test("basePath 不匹配(没经过代理)→ null(避免 SSRF 越界)", () => {
    expect(resolveAmapProxyTarget({
      pathname: "/api/v3/place/text",
      search: "",
      key, securityJsCode: js,
    })).toBeNull();
  });

  test("SSRF 防御:pathname 残留段含绝对 URL(https://evil.com/x)→ null", () => {
    // 攻击者拼 pathname 让 URL 构造器把 base 替换成 evil host
    // URL 构造器遇到绝对 URL 时忽略 base,所以最终 hostname 会变成 evil.com → 白名单兜底
    expect(resolveAmapProxyTarget({
      pathname: "/_AMapService/https://evil.com/x",
      search: "",
      key, securityJsCode: js,
    })).toBeNull();
  });

  test("自定义 basePath → 同样参与白名单校验", () => {
    const u = resolveAmapProxyTarget({
      basePath: "/amap",
      pathname: "/amap/v3/place/text",
      search: "?keywords=foo",
      key, securityJsCode: js,
    });
    expect(u?.hostname).toBe("restapi.amap.com");
    expect(u?.pathname).toBe("/v3/place/text");
    expect(u?.searchParams.get("jscode")).toBe(js);
  });
});