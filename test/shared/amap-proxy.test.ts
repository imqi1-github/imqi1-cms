import { describe, expect, test } from "bun:test";

import {
  AMAP_PROXY_BASE_PATH,
  buildAmapDirectScriptUrl,
  buildAmapProxyScriptUrl,
  buildAmapServiceHost,
  resolveAmapProxyTarget,
} from "#shared/amap-proxy";

describe("AMAP_PROXY_BASE_PATH", () => {
  test("默认代理路径是 /_AMapService", () => {
    expect(AMAP_PROXY_BASE_PATH).toBe("/_AMapService");
  });
});

describe("buildAmapProxyScriptUrl", () => {
  test("空选项 → 默认版本 2.0 + 代理路径 /maps", () => {
    expect(buildAmapProxyScriptUrl()).toBe("/_AMapService/maps?v=2.0");
  });

  test("显式指定版本/插件/回调全部拼到 query", () => {
    const url = buildAmapProxyScriptUrl({
      version: "2.0.1",
      plugins: ["AMap.ToolBar", "AMap.Scale"],
      callback: "initAMap",
    });
    expect(url).toContain("/maps?");
    expect(url).toContain("v=2.0.1");
    expect(url).toContain("plugin=AMap.ToolBar%2CAMap.Scale");
    expect(url).toContain("callback=initAMap");
  });

  test("空 plugins 数组 → 不出现 plugin 参数", () => {
    expect(buildAmapProxyScriptUrl({ plugins: [] })).not.toContain("plugin=");
  });

  test("空字符串 callback → 不出现 callback 参数", () => {
    expect(buildAmapProxyScriptUrl({ callback: "" })).not.toContain("callback=");
  });

  test("自定义 basePath 自动补 /,末尾 / 抹掉", () => {
    expect(buildAmapProxyScriptUrl({ basePath: "api" })).toContain("/api/maps?");
    expect(buildAmapProxyScriptUrl({ basePath: "/api/" })).toContain("/api/maps?");
    expect(buildAmapProxyScriptUrl({ basePath: "//api//" })).toContain("/api/maps?");
  });

  test("basePath 为空串/全 / 时回落到默认 /_AMapService", () => {
    expect(buildAmapProxyScriptUrl({ basePath: "" })).toContain("/_AMapService/maps?");
    expect(buildAmapProxyScriptUrl({ basePath: "///" })).toContain("/_AMapService/maps?");
  });
});

describe("buildAmapDirectScriptUrl", () => {
  test("直连高德 webapi,maps 路径必须带 key", () => {
    const url = buildAmapDirectScriptUrl({ key: "test-key" });
    expect(url.startsWith("https://webapi.amap.com/maps?")).toBe(true);
    expect(url).toContain("v=2.0");
    expect(url).toContain("key=test-key");
  });

  test("插件/回调可选", () => {
    const url = buildAmapDirectScriptUrl({
      key: "k",
      plugins: ["AMap.Polyline"],
      callback: "cb",
      version: "2.0.5",
    });
    expect(url).toContain("v=2.0.5");
    expect(url).toContain("key=k");
    expect(url).toContain("plugin=AMap.Polyline");
    expect(url).toContain("callback=cb");
  });

  test("空 plugins/空 callback → 不出现对应参数", () => {
    const url = buildAmapDirectScriptUrl({ key: "k", plugins: [], callback: "" });
    expect(url).not.toContain("plugin=");
    expect(url).not.toContain("callback=");
  });
});

describe("buildAmapServiceHost", () => {
  test("绝对 origin + 默认 basePath 拼出完整 URL", () => {
    expect(buildAmapServiceHost("https://example.com")).toBe("https://example.com/_AMapService");
  });

  test("origin 末尾斜杠 + basePath 起始斜杠会被 URL 规范化为单个 /", () => {
    const url = buildAmapServiceHost("https://example.com/", "/_AMapService/");
    expect(url).toBe("https://example.com/_AMapService");
  });

  test("自定义 basePath 同样补 / + 去尾 /", () => {
    expect(buildAmapServiceHost("https://x.com", "api")).toBe("https://x.com/api");
  });
});

describe("resolveAmapProxyTarget", () => {
  const key = "test-key";
  const jscode = "test-jscode";
  const basePath = AMAP_PROXY_BASE_PATH;

  test("maps 路径 → 转发到 webapi script upstream,带 key", () => {
    const url = resolveAmapProxyTarget({
      pathname: `${basePath}/maps`,
      search: "?v=2.0&plugin=AMap.ToolBar",
      key,
      securityJsCode: jscode,
    });
    expect(url).not.toBeNull();
    expect(url!.hostname).toBe("webapi.amap.com");
    expect(url!.pathname).toBe("/maps");
    expect(url!.searchParams.get("v")).toBe("2.0");
    expect(url!.searchParams.get("plugin")).toBe("AMap.ToolBar");
    expect(url!.searchParams.get("key")).toBe(key);
    // 不应带 jscode(maps 路径不带)
    expect(url!.searchParams.has("jscode")).toBe(false);
  });

  test("v4/map/styles 路径 → 转发到 webapi styles,带 jscode 不带 key", () => {
    const url = resolveAmapProxyTarget({
      pathname: `${basePath}/v4/map/styles`,
      search: "?id=normal",
      key,
      securityJsCode: jscode,
    });
    expect(url).not.toBeNull();
    expect(url!.hostname).toBe("webapi.amap.com");
    expect(url!.pathname).toBe("/v4/map/styles");
    expect(url!.searchParams.get("id")).toBe("normal");
    expect(url!.searchParams.get("jscode")).toBe(jscode);
    expect(url!.searchParams.has("key")).toBe(false);
  });

  test("其它子路径 → 转发到 restapi upstream,带 jscode 不带 key", () => {
    const url = resolveAmapProxyTarget({
      pathname: `${basePath}/v3/place/text`,
      search: "?keywords=上海",
      key,
      securityJsCode: jscode,
    });
    expect(url).not.toBeNull();
    expect(url!.hostname).toBe("restapi.amap.com");
    expect(url!.pathname).toBe("/v3/place/text");
    expect(url!.searchParams.get("jscode")).toBe(jscode);
    expect(url!.searchParams.has("key")).toBe(false);
  });

  test("请求方传的 key / jscode 会被从上游 URL 抹掉(防止请求方参数泄漏到上游)", () => {
    const url = resolveAmapProxyTarget({
      pathname: `${basePath}/maps`,
      search: "?key=leaked&jscode=leaked",
      key,
      securityJsCode: jscode,
    });
    expect(url!.searchParams.has("jscode")).toBe(false);
    // maps 路径会重新设置 key,但应当是函数参数里的 key,不是原始 ?key=leaked
    expect(url!.searchParams.get("key")).toBe(key);
  });

  test("路径不在 basePath 前缀下 → 返回 null", () => {
    expect(resolveAmapProxyTarget({
      pathname: "/other/maps",
      search: "",
      key,
      securityJsCode: jscode,
    })).toBeNull();
  });

  test("SSRF 防御:子路径含 scheme → 被 URL 当绝对 URL 解析,hostname 不在白名单 → null", () => {
    // pathname = "/_AMapService/https://evil.com/x",slice 后是 "https://evil.com/x"
    // new URL("https://evil.com/x", base) 把第一个当绝对 URL 解析,host 覆盖为 evil.com → 不在白名单 → null
    const url = resolveAmapProxyTarget({
      pathname: `${basePath}/https://evil.com/x`,
      search: "",
      key,
      securityJsCode: jscode,
    });
    expect(url).toBeNull();
  });

  test("自定义 basePath 与 default 不同 → 路径分支相应切换", () => {
    const url = resolveAmapProxyTarget({
      pathname: "/amap-api/maps",
      search: "?v=2.0",
      key,
      securityJsCode: jscode,
      basePath: "/amap-api",
    });
    expect(url).not.toBeNull();
    expect(url!.hostname).toBe("webapi.amap.com");
    expect(url!.searchParams.get("key")).toBe(key);
  });

  test("自定义 basePath 下走非前缀路径 → null", () => {
    // pathname 不以 /amap-api/ 开头 → 走 basePath 前缀检查分支 → null
    // 注:pathname 在 basePath 下但落在通用 restapi 分支时,host 仍是 restapi.amap.com → 不为 null
    expect(resolveAmapProxyTarget({
      pathname: "/other/wrong",
      search: "",
      key,
      securityJsCode: jscode,
      basePath: "/amap-api",
    })).toBeNull();
  });

  test("无 search 时不报错,query 仍带上 key/jscode", () => {
    const url = resolveAmapProxyTarget({
      pathname: `${basePath}/v3/place/text`,
      search: "",
      key,
      securityJsCode: jscode,
    });
    expect(url).not.toBeNull();
    expect(url!.searchParams.get("jscode")).toBe(jscode);
  });

  test("search 起始 ? 会被剥掉", () => {
    const url = resolveAmapProxyTarget({
      pathname: `${basePath}/maps`,
      search: "?v=2.0",
      key,
      securityJsCode: jscode,
    });
    expect(url!.searchParams.get("v")).toBe("2.0");
  });
});