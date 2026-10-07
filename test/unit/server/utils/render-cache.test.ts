/**
 * render-cache：渲染 LRU 的容量上限与 key 语义。
 * 回归背景：详情 API 曾每次 SSR 导航都全量重跑 Shiki 高亮。
 */
import { describe, expect, test } from "bun:test";

const { getCachedRender, setCachedRender } = await import("#server/utils/render-cache");

describe("render-cache", () => {
  test("命中返回缓存内容,未命中返回 null", () => {
    expect(getCachedRender("10:1000")).toBeNull();
    setCachedRender("10:1000", "<h1>hi</h1>");
    expect(getCachedRender("10:1000")).toBe("<h1>hi</h1>");
  });

  test("update_time 变化 → 新 key 未命中(自然失效语义)", () => {
    setCachedRender("11:2000", "old");
    expect(getCachedRender("11:2000")).toBe("old");
    // 文章被编辑:cid 不变、update_time 推进 → 旧缓存取不到
    expect(getCachedRender("11:2001")).toBeNull();
  });

  test("超过容量上限淘汰最旧条目,最近使用的保留", () => {
    // 灌满 30 个(render-cache CAP=30),再不断触碰第 0 个使其成为「最近使用」
    for (let i = 0; i < 30; i++) setCachedRender(`hot:${i}`, `v${i}`);
    setCachedRender("hot:0", "v0");
    expect(getCachedRender("hot:0")).toBe("v0");
    // 灌入 1 个新条目 → 淘汰的是「最久未使用」的 hot:1,而非被触碰过的 hot:0
    setCachedRender("hot:new", "vnew");
    expect(getCachedRender("hot:0")).toBe("v0");
    expect(getCachedRender("hot:1")).toBeNull();
    expect(getCachedRender("hot:new")).toBe("vnew");
  });
});
