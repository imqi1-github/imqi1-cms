import { afterEach, beforeEach, describe, expect, test } from "bun:test";
import { ref } from "vue";

import { usePageSeo } from "~/composables/usePageSeo";

// usePageSeo 内部用 useHead 与 unref,unref 没在 setup-composable-globals.ts 自动装,
// 我们自己 stub。useHead 也用函数式包装以拿到真实 payload。
const headCalls: Array<{ title?: unknown; meta?: Array<{ name?: string; property?: string; content?: string }> }> = [];
let origUseHead: unknown;
let origUnref: unknown;

beforeEach(() => {
  headCalls.length = 0;
  origUseHead = (globalThis as Record<string, unknown>).useHead;
  origUnref = (globalThis as Record<string, unknown>).unref;
  (globalThis as Record<string, unknown>).useHead = (input: unknown) => {
    // usePageSeo 用函数式 useHead(() => {...}),我们立即执行拿到 payload 记下
    const payload = typeof input === "function" ? (input as () => unknown)() : input;
    headCalls.push(payload as { title?: unknown; meta?: Array<{ name?: string; property?: string; content?: string }> });
  };
  (globalThis as Record<string, unknown>).unref = (v: unknown) => {
    if (v && typeof v === "object" && "value" in (v as Record<string, unknown>)) {
      return (v as { value: unknown }).value;
    }
    return v;
  };
});
afterEach(() => {
  (globalThis as Record<string, unknown>).useHead = origUseHead;
  if (origUnref !== undefined) {
    (globalThis as Record<string, unknown>).unref = origUnref;
  } else {
    delete (globalThis as Record<string, unknown>).unref;
  }
});

describe("usePageSeo", () => {
  test("仅 title → 生成 og:title/twitter:title + 默认 og:type=website", () => {
    usePageSeo({ title: "Hello" });
    expect(headCalls).toHaveLength(1);
    const meta = headCalls[0].meta!;
    expect(meta.some(m => m.property === "og:title" && m.content === "Hello")).toBe(true);
    expect(meta.some(m => m.name === "twitter:title" && m.content === "Hello")).toBe(true);
    expect(meta.some(m => m.property === "og:type" && m.content === "website")).toBe(true);
  });

  test("title + description + keywords → 全套 meta", () => {
    usePageSeo({ title: "T", description: "D", keywords: "K" });
    const meta = headCalls[0].meta!;
    expect(meta.some(m => m.name === "description" && m.content === "D")).toBe(true);
    expect(meta.some(m => m.name === "keywords" && m.content === "K")).toBe(true);
    expect(meta.some(m => m.property === "og:description" && m.content === "D")).toBe(true);
    expect(meta.some(m => m.name === "twitter:description" && m.content === "D")).toBe(true);
  });

  test("title 是 ComputedRef → useHead 走函数式响应(立即执行取到 value)", () => {
    const titleRef = ref("动态标题");
    usePageSeo({ title: titleRef });
    expect(headCalls[0].title).toBe("动态标题");
  });

  test("description 是 ComputedRef → 立即 unref 后写入 meta", () => {
    usePageSeo({ title: "T", description: ref("动态描述") });
    const meta = headCalls[0].meta!;
    expect(meta.some(m => m.name === "description" && m.content === "动态描述")).toBe(true);
    expect(meta.some(m => m.property === "og:description" && m.content === "动态描述")).toBe(true);
  });

  test("缺 description/keywords → 不写对应 meta(避免空字符串污染)", () => {
    usePageSeo({ title: "Only Title" });
    const meta = headCalls[0].meta!;
    expect(meta.some(m => m.name === "description")).toBe(false);
    expect(meta.some(m => m.name === "keywords")).toBe(false);
    expect(meta.some(m => m.property === "og:description")).toBe(false);
    expect(meta.some(m => m.name === "twitter:description")).toBe(false);
  });

  test("ogType 自定义(article / profile / website)", () => {
    usePageSeo({ title: "博文", ogType: "article" });
    const meta = headCalls[0].meta!;
    expect(meta.some(m => m.property === "og:type" && m.content === "article")).toBe(true);
  });

  test("字符串 title 直接写入(支持非响应式)", () => {
    usePageSeo({ title: "Static" });
    expect(headCalls[0].title).toBe("Static");
  });
});