import { afterEach, beforeEach, describe, expect, test } from "bun:test";

import { usePageTitle } from "~/composables/usePageTitle";

const sharedKeys = ["page-title:title", "page-title:icon", "page-title:category"];

beforeEach(() => sharedKeys.forEach(k => useState(k, () => null).value = null));
afterEach(() => sharedKeys.forEach(k => useState(k, () => null).value = null));

describe("usePageTitle", () => {
  test("setPageTitle 写入 title;icon 缺省清空旧 icon", () => {
    const { setPageTitle, getPageTitle, getPageIcon } = usePageTitle();
    setPageTitle("首页", "🏠");
    expect(getPageTitle().value).toBe("首页");
    expect(getPageIcon().value).toBe("🏠");

    setPageTitle("关于");
    expect(getPageTitle().value).toBe("关于");
    expect(getPageIcon().value).toBeNull();
  });

  test("setPageCategory / getPageCategory 双向同步", () => {
    const { setPageCategory, getPageCategory } = usePageTitle();
    setPageCategory("article");
    expect(getPageCategory().value).toBe("article");
    setPageCategory("page");
    expect(getPageCategory().value).toBe("page");
  });

  test("clearPageTitle 一并清空 title/icon/category", () => {
    const { setPageTitle, setPageCategory, clearPageTitle, getPageTitle, getPageIcon, getPageCategory } = usePageTitle();
    setPageTitle("A", "🐱");
    setPageCategory("article");
    clearPageTitle();
    expect(getPageTitle().value).toBeNull();
    expect(getPageIcon().value).toBeNull();
    expect(getPageCategory().value).toBeNull();
  });
});