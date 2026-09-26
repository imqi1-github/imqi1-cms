import { afterEach, beforeEach, describe, expect, test } from "bun:test";

import { useNotFoundPage } from "~/composables/useNotFoundPage";
import { usePageSeo } from "~/composables/usePageSeo";
import { usePageTitle } from "~/composables/usePageTitle";

let origUseRequestEvent: unknown;
let origUseFadeOut: unknown;
let origUseHead: unknown;
let origUnref: unknown;
let origUsePageTitle: unknown;
let origUsePageSeo: unknown;
const headCalls: Array<{ title?: unknown; meta?: Array<{ name?: string; property?: string; content?: string }> }> = [];

beforeEach(() => {
  headCalls.length = 0;

  origUseRequestEvent = (globalThis as Record<string, unknown>).useRequestEvent;
  origUseFadeOut = (globalThis as Record<string, unknown>).useFadeOutOnNavigate;
  origUseHead = (globalThis as Record<string, unknown>).useHead;
  origUnref = (globalThis as Record<string, unknown>).unref;
  origUsePageTitle = (globalThis as Record<string, unknown>).usePageTitle;
  origUsePageSeo = (globalThis as Record<string, unknown>).usePageSeo;

  // bun:test 默认非 server → setResponseStatus 分支不进,useRequestEvent 仅在测 server 时显式覆盖
  (globalThis as Record<string, unknown>).useRequestEvent = () => undefined;

  // useFadeOutOnNavigate 是返回 Promise.resolve 的最小 stub
  (globalThis as Record<string, unknown>).useFadeOutOnNavigate = () => Promise.resolve();

  // usePageTitle / usePageSeo:源码靠 Nuxt 自动导入,这里挂显式值
  (globalThis as Record<string, unknown>).usePageTitle = usePageTitle;
  (globalThis as Record<string, unknown>).usePageSeo = usePageSeo;

  // useHead 函数式 stub
  (globalThis as Record<string, unknown>).useHead = (input: unknown) => {
    const payload = typeof input === "function" ? (input as () => unknown)() : input;
    headCalls.push(payload as { title?: unknown; meta?: Array<{ name?: string; property?: string; content?: string }> });
  };
  (globalThis as Record<string, unknown>).unref = (v: unknown) =>
    v && typeof v === "object" && "value" in (v as Record<string, unknown>)
      ? (v as { value: unknown }).value
      : v;
});

afterEach(() => {
  if (origUseRequestEvent !== undefined) {
    (globalThis as Record<string, unknown>).useRequestEvent = origUseRequestEvent;
  } else {
    delete (globalThis as Record<string, unknown>).useRequestEvent;
  }
  if (origUseFadeOut !== undefined) {
    (globalThis as Record<string, unknown>).useFadeOutOnNavigate = origUseFadeOut;
  } else {
    delete (globalThis as Record<string, unknown>).useFadeOutOnNavigate;
  }
  if (origUseHead !== undefined) {
    (globalThis as Record<string, unknown>).useHead = origUseHead;
  } else {
    delete (globalThis as Record<string, unknown>).useHead;
  }
  if (origUnref !== undefined) {
    (globalThis as Record<string, unknown>).unref = origUnref;
  } else {
    delete (globalThis as Record<string, unknown>).unref;
  }
  if (origUsePageTitle !== undefined) {
    (globalThis as Record<string, unknown>).usePageTitle = origUsePageTitle;
  } else {
    delete (globalThis as Record<string, unknown>).usePageTitle;
  }
  if (origUsePageSeo !== undefined) {
    (globalThis as Record<string, unknown>).usePageSeo = origUsePageSeo;
  } else {
    delete (globalThis as Record<string, unknown>).usePageSeo;
  }
  // 清 usePageTitle 共享状态
  for (const k of ["page-title:title", "page-title:icon", "page-title:category"]) {
    useState(k, () => null).value = null;
  }
});

describe("useNotFoundPage(client 模式)", () => {
  test("返回 Promise", () => {
    const p = useNotFoundPage();
    expect(p).toBeInstanceOf(Promise);
  });

  test("设置 page title 为「页面未找到」+ icon=ri:close-large-fill", () => {
    useNotFoundPage();
    expect(useState<string | null>("page-title:title", () => null).value).toBe("页面未找到");
    expect(useState<string | null>("page-title:icon", () => null).value).toBe("ri:close-large-fill");
  });

  test("useHead 写入 title(含站名) + og:title + description/keywords", () => {
    useNotFoundPage();
    expect(headCalls.length).toBeGreaterThanOrEqual(1);
    const payload = headCalls[0];
    expect(payload?.title).toContain("页面未找到");
    const meta = payload?.meta ?? [];
    expect(meta.some(m => m.property === "og:title" && (m.content ?? "").includes("页面未找到"))).toBe(true);
    expect(meta.some(m => m.name === "description" && typeof m.content === "string" && m.content.length > 0)).toBe(true);
    expect(meta.some(m => m.name === "keywords" && typeof m.content === "string" && m.content.length > 0)).toBe(true);
  });

  test("clearPageTitle 在 setTitle 之前(避免旧 title 残留后再被覆盖)", () => {
    // 模拟已有旧 title/icon/category
    const { setPageTitle, setPageCategory } = usePageTitle();
    setPageTitle("旧页", "旧icon");
    setPageCategory("article");

    useNotFoundPage();
    expect(useState<string | null>("page-title:title", () => null).value).toBe("页面未找到");
    expect(useState<string | null>("page-title:icon", () => null).value).toBe("ri:close-large-fill");
    expect(useState<string | null>("page-title:category", () => null).value).toBeNull();
  });
});

describe("useNotFoundPage(server 分支)", () => {
  test("useRequestEvent 返回 undefined → setResponseStatus 不被调(SSR 时也无 event 时降级)", () => {
    let statusCalled = false;
    // 即便 import.meta.server=false,这条 server 分支走不到;这里仅验证 useRequestEvent stub 路径
    const origSetStatus = (globalThis as Record<string, unknown>).setResponseStatus;
    (globalThis as Record<string, unknown>).setResponseStatus = () => {
      statusCalled = true;
    };
    try {
      useNotFoundPage();
      expect(statusCalled).toBe(false);
    } finally {
      (globalThis as Record<string, unknown>).setResponseStatus = origSetStatus;
    }
  });
});