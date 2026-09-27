/**
 * 客户端 markdown 自定义容器占位元信息 CONTAINER_META + UNKNOWN_CONTAINER_META + deriveCalloutVariant
 *
 * 与服务端 markdown.ts 内联容器集保持一致:
 *  - 服务端支持 10 种容器:live-photo / video / callout / card / simple-card / swiper / waterfall / repo / music / details
 *  - callout 仅四种变体:success / warning / error / info
 *  - 未知容器 → "自定义容器" 兜底,不再用 "details" 占位(诚实哨兵 type=null)
 */
import { describe, expect, test } from "bun:test";

import { CONTAINER_META, UNKNOWN_CONTAINER_META, deriveCalloutVariant } from "~/components/markdown-editor/containerMeta";

describe("CONTAINER_META:10 种容器全覆盖", () => {
  test("所有期望的容器都登记了元信息", () => {
    const expected = [
      "live-photo",
      "video",
      "callout",
      "card",
      "simple-card",
      "swiper",
      "waterfall",
      "repo",
      "music",
      "details",
    ];
    for (const t of expected) {
      expect(CONTAINER_META[t]).toBeDefined();
      expect(CONTAINER_META[t].type).toBe(t);
      expect(CONTAINER_META[t].label.length).toBeGreaterThan(0);
      expect(CONTAINER_META[t].icon).toMatch(/^lucide:/);
    }
  });

  test("登记的容器集合与服务端 markdown.ts 容器集一致(避免漏注册致占位空白)", () => {
    expect(Object.keys(CONTAINER_META).sort()).toEqual(
      ["callout", "card", "details", "live-photo", "music", "repo", "simple-card", "swiper", "video", "waterfall"].sort(),
    );
  });
});

describe("UNKNOWN_CONTAINER_META:兜底", () => {
  test("type=null 诚实哨兵(不再用 details 占位,防消费方误判)", () => {
    expect(UNKNOWN_CONTAINER_META.type).toBeNull();
  });

  test("label 非空 + icon 是 lucide: 前缀", () => {
    expect(UNKNOWN_CONTAINER_META.label.length).toBeGreaterThan(0);
    expect(UNKNOWN_CONTAINER_META.icon).toMatch(/^lucide:/);
  });
});

describe("deriveCalloutVariant:仅 callout 行命中", () => {
  test("success / warning / error / info 四类均命中", () => {
    expect(deriveCalloutVariant(":::callout success")).toBe("success");
    expect(deriveCalloutVariant(":::callout warning")).toBe("warning");
    expect(deriveCalloutVariant(":::callout error")).toBe("error");
    expect(deriveCalloutVariant(":::callout info")).toBe("info");
  });

  test("非枚举变体 → null(交给 unknown 兜底)", () => {
    expect(deriveCalloutVariant(":::callout debug")).toBeNull();
    expect(deriveCalloutVariant(":::callout NOTE")).toBeNull(); // 大小写敏感
    expect(deriveCalloutVariant(":::callout")).toBeNull(); // 缺变体
  });

  test("非 callout 容器 → null", () => {
    expect(deriveCalloutVariant("::: card https://x.com")).toBeNull();
    expect(deriveCalloutVariant(":::video https://x.com")).toBeNull();
    expect(deriveCalloutVariant("普通段落")).toBeNull();
  });

  test("callout 变体后跟随其它字符(标题/参数)也能正确提取变体", () => {
    expect(deriveCalloutVariant(":::callout warning 标题")).toBe("warning");
    expect(deriveCalloutVariant(":::callout info\n内容")).toBe("info");
  });
});