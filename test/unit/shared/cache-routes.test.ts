// 列表/统计页识别：决定「边缘 TTL 短 + 写库时不刷边缘」的页面范围。
import { describe, expect, test } from "bun:test";

import { canonicalSearch, isListPageRoute, significantQueryParams } from "#shared/cache-routes";

describe("isListPageRoute", () => {
  test("列表/统计页：内嵌评论数等聚合数据，边缘 TTL 短", () => {
    expect(isListPageRoute("/")).toBe(true);
    expect(isListPageRoute("/category/note")).toBe(true);
    expect(isListPageRoute("/tag/life")).toBe(true);
    expect(isListPageRoute("/archiving")).toBe(true);
    expect(isListPageRoute("/about")).toBe(true);
    expect(isListPageRoute("/sitemap")).toBe(true);
    // /map 内嵌访客分布等易变聚合，与列表页同档
    expect(isListPageRoute("/map")).toBe(true);
  });

  test("内容页：边缘 TTL 长，靠精确 URL 刷新", () => {
    expect(isListPageRoute("/content/note/1024")).toBe(false);
    expect(isListPageRoute("/links")).toBe(false);
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

describe("显著查询参数（影响 SSR 输出的参数）", () => {
  test("登记了会改变 SSR 输出的参数", () => {
    expect(significantQueryParams("/category/note")).toEqual(["page"]);
    expect(significantQueryParams("/tag/life")).toEqual(["page"]);
    expect(significantQueryParams("/map")).toEqual(["view", "place"]);
    expect(significantQueryParams("/subscribes")).toEqual(["source"]);
    expect(significantQueryParams("/changelogs")).toEqual(["type"]);
    expect(significantQueryParams("/about")).toEqual([]);
  });

  test("规范化查询串：只留显著参数，顺序固定", () => {
    expect(canonicalSearch("/map", { place: "5", view: "travels", utm: "x" })).toBe("?view=travels&place=5");
    expect(canonicalSearch("/category/note", { page: "2" })).toBe("?page=2");
    expect(canonicalSearch("/about", { utm: "x" })).toBe("");
    expect(canonicalSearch("/subscribes", { source: "3" })).toBe("?source=3");
  });

  test("缺省值的参数不写入查询串", () => {
    expect(canonicalSearch("/map", { view: "travels" })).toBe("?view=travels");
    expect(canonicalSearch("/category/note", {})).toBe("");
  });
});

describe("分页参数归一化", () => {
  test("?page=1 与不带参数等价 → 折叠成一条缓存键", () => {
    expect(canonicalSearch("/category/note", { page: "1" })).toBe("");
    expect(canonicalSearch("/tag/js", { page: "1" })).toBe("");
  });

  test("非法 page（后端回退第 1 页）同样折叠", () => {
    for (const bad of ["abc", "0", "-5", ""]) {
      expect(canonicalSearch("/category/note", { page: bad })).toBe("");
    }
  });

  test("page>=2 保留（第 2 页起是独立内容）", () => {
    expect(canonicalSearch("/category/note", { page: "2" })).toBe("?page=2");
    expect(canonicalSearch("/category/note", { page: "9", utm: "x" })).toBe("?page=9");
  });
});
