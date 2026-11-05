// 列表/统计页识别：决定「边缘 TTL 短 + 写库时不刷边缘」的页面范围。
import { describe, expect, test } from "bun:test";

import { isListPageRoute } from "#server/utils/cache-routes";

describe("isListPageRoute", () => {
  test("列表/统计页：内嵌评论数等聚合数据，边缘 TTL 短", () => {
    expect(isListPageRoute("/")).toBe(true);
    expect(isListPageRoute("/category/note")).toBe(true);
    expect(isListPageRoute("/tag/life")).toBe(true);
    expect(isListPageRoute("/archiving")).toBe(true);
    expect(isListPageRoute("/about")).toBe(true);
    expect(isListPageRoute("/sitemap")).toBe(true);
  });

  test("内容页：边缘 TTL 长，靠精确 URL 刷新", () => {
    expect(isListPageRoute("/content/note/1024")).toBe(false);
    expect(isListPageRoute("/links")).toBe(false);
    expect(isListPageRoute("/map")).toBe(false);
    expect(isListPageRoute("/subscribes")).toBe(false);
    expect(isListPageRoute("/changelogs")).toBe(false);
    expect(isListPageRoute("/agreement")).toBe(false);
    expect(isListPageRoute("/messages")).toBe(false);
    expect(isListPageRoute("/sitemap.xml")).toBe(false);
  });

  test("通配路由写法（失效路由常量里的形式）也能识别", () => {
    expect(isListPageRoute("/category/**")).toBe(true);
    expect(isListPageRoute("/tag/**")).toBe(true);
    expect(isListPageRoute("/content/**")).toBe(false);
  });

  test("带查询串不影响判断", () => {
    expect(isListPageRoute("/about?x=1")).toBe(true);
    expect(isListPageRoute("/content/note/1?x=1")).toBe(false);
  });
});
