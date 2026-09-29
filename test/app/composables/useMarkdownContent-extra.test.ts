/**
 * useMarkdownContent 补测:
 *  - mount/cleanup 的返回值都是 function(只读)
 *  - mount 调用安全(测试环境 client=false → 提前 return)
 *  - findImageDimensions 选项契约
 */
import { beforeEach, describe, expect, test } from "bun:test";

import { useMarkdownContent } from "~/composables/useMarkdownContent";

beforeEach(() => {
  // 重置可能的全局状态(useMarkdownContent 不持久状态,但保持每个 test 独立)
});

describe("useMarkdownContent:返回 shape", () => {
  test("返回 { mount, cleanup } 两个函数,其它键不暴露", () => {
    const r = useMarkdownContent({ findImageDimensions: () => ({ width: 0, height: 0 }) });
    expect(typeof r.mount).toBe("function");
    expect(typeof r.cleanup).toBe("function");
    expect(Object.keys(r).sort()).toEqual(["cleanup", "mount"]);
  });

  test("mount 调用安全,不依赖 DOM(测试环境 client=false → 提前 return)", () => {
    const { mount } = useMarkdownContent({ findImageDimensions: () => ({ width: 100, height: 50 }) });
    expect(() => mount()).not.toThrow();
  });
});

describe("useMarkdownContent:选项契约", () => {
  test("findImageDimensions 缺省时使用默认空实现(不抛)", () => {
    const { mount } = useMarkdownContent({} as Parameters<typeof useMarkdownContent>[0]);
    expect(() => mount()).not.toThrow();
  });

  test("findImageDimensions 返回 null 不抛(留待 DOM 阶段决定 aspect)", () => {
    const { mount } = useMarkdownContent({ findImageDimensions: () => ({ width: null, height: null }) });
    expect(() => mount()).not.toThrow();
  });

  test("findImageDimensions 返回 {width,height} 都为 null 不抛", () => {
    const { mount } = useMarkdownContent({ findImageDimensions: () => ({ width: null, height: null }) });
    expect(() => mount()).not.toThrow();
  });

  test("findImageDimensions 返回 {width:0,height:0} → mount 安全", () => {
    const { mount } = useMarkdownContent({ findImageDimensions: () => ({ width: 0, height: 0 }) });
    expect(() => mount()).not.toThrow();
  });

  test("findImageDimensions 返回 {width:-1,height:-1} → mount 安全(由 DOM 阶段容错)", () => {
    const { mount } = useMarkdownContent({ findImageDimensions: () => ({ width: -1, height: -1 }) });
    expect(() => mount()).not.toThrow();
  });
});