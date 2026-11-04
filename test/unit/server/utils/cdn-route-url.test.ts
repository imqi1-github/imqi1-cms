// 站内路由 → CDN 刷新目标的映射。
// 关键约束：EdgeOne 不支持通配符 URL，`/**` 路由只能转成目录前缀（带结尾斜杠）。
import { describe, expect, test } from "bun:test";

import { normalizeBaseUrl, routeToPurgeTarget, routesToPurgeTargets } from "#server/utils/cdn/route-url";

const BASE = "https://imqi1.com";

describe("routeToPurgeTarget", () => {
  test("根路由 → 精确 URL", () => {
    expect(routeToPurgeTarget("/", BASE)).toEqual({ kind: "url", value: "https://imqi1.com/" });
  });

  test("普通页面 → 精确 URL", () => {
    expect(routeToPurgeTarget("/archiving", BASE)).toEqual({ kind: "url", value: "https://imqi1.com/archiving" });
  });

  test("通配路由 → 目录前缀（带结尾斜杠）", () => {
    expect(routeToPurgeTarget("/content/**", BASE)).toEqual({ kind: "prefix", value: "https://imqi1.com/content/" });
    expect(routeToPurgeTarget("/category/**", BASE)).toEqual({ kind: "prefix", value: "https://imqi1.com/category/" });
  });

  test("/** → 全站根目录前缀", () => {
    expect(routeToPurgeTarget("/**", BASE)).toEqual({ kind: "prefix", value: "https://imqi1.com/" });
  });

  test("base 末尾斜杠被去掉，不会拼出双斜杠", () => {
    expect(normalizeBaseUrl("https://imqi1.com/")).toBe("https://imqi1.com");
    expect(routeToPurgeTarget("/about", "https://imqi1.com/")).toEqual({ kind: "url", value: "https://imqi1.com/about" });
  });

  test("缺少前导斜杠的路由也能补齐", () => {
    expect(routeToPurgeTarget("about", BASE)).toEqual({ kind: "url", value: "https://imqi1.com/about" });
  });
});

describe("routesToPurgeTargets", () => {
  test("空路由列表 → 全站一条根目录前缀", () => {
    expect(routesToPurgeTargets([], BASE)).toEqual([{ kind: "prefix", value: "https://imqi1.com/" }]);
  });

  test("多路由 → 按序展开", () => {
    expect(routesToPurgeTargets(["/", "/content/**"], BASE)).toEqual([
      { kind: "url", value: "https://imqi1.com/" },
      { kind: "prefix", value: "https://imqi1.com/content/" },
    ]);
  });
});
