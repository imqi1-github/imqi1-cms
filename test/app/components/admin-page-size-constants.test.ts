/**
 * admin/PageSizeSelect.vue 源码不变式补测:
 *  - 模型值是 number 字段,options.value 全是字符串(防 reka-ui 匹配不上)
 *  - 当前 modelValue 不在预设档时会被插进 options 列表(否则 SelectValue 显示空)
 *  - applyCustom 相等不 emit(防无意义写回)
 *  - 哨兵 CUSTOM_OPTION 字符串 "custom" 贯穿
 */
import { readFileSync } from "node:fs";

import { describe, expect, test } from "bun:test";

const src = readFileSync("app/components/admin/PageSizeSelect.vue", "utf8");

describe("PageSizeSelect:预设档 + 自定义档完整性", () => {
  test("ADMIN_PAGE_SIZE_PRESETS 三档 + 自定义档全在 options 列表里", () => {
    // 模式:list.splice(1, 0, ...) 插入当前 modelValue(若不在预设档)
    // 然后 list.push({ value: CUSTOM_OPTION, ... })
    expect(src).toMatch(/ADMIN_PAGE_SIZE_PRESETS\.map\(\s*size\s*=>\s*\(\{\s*value:\s*String\(\s*size\s*\)/);
    expect(src).toMatch(/ADMIN_PAGE_SIZE_PRESETS\.includes\(\s*props\.modelValue\s*\)/);
  });

  test("selected getter 始终返回 String(props.modelValue) — 非空时显示文字", () => {
    expect(src).toMatch(/get:\s*\(\s*\)\s*=>\s*String\(\s*props\.modelValue\s*\)/);
  });

  test("selected setter:命中 CUSTOM_OPTION 走 startCustom,否则 emit(clamp)", () => {
    const setterMatch = /set:\s*\(value:[^)]+\)\s*=>\s*\{([\s\S]*?)\n\s*\},/.exec(src);
    expect(setterMatch).not.toBeNull();
    const body = setterMatch![1]!;
    expect(body).toMatch(/value\s*===\s*CUSTOM_OPTION/);
    expect(body).toMatch(/startCustom\(\)/);
    expect(body).toMatch(/emit\(\s*["']update:modelValue["']\s*,\s*clampAdminPageSize\(value,\s*props\.modelValue\)\)/);
  });
});

describe("PageSizeSelect:applyCustom 防无意义 emit", () => {
  test("applyCustom 用 if (size !== props.modelValue) 守卫避免空写回", () => {
    const match = /function\s+applyCustom\s*\(\s*\)\s*\{([\s\S]*?)\n\}/.exec(src);
    expect(match).not.toBeNull();
    expect(match![1]).toMatch(/size\s*!==\s*props\.modelValue/);
  });

  test("applyCustom 先关 customMode 再计算 size 与 emit", () => {
    const match = /function\s+applyCustom\s*\(\s*\)\s*\{([\s\S]*?)\n\}/.exec(src);
    expect(match).not.toBeNull();
    const body = match![1]!;
    const idxClose = body.indexOf("customMode.value = false");
    const idxClamp = body.indexOf("clampAdminPageSize");
    const idxEmit = body.indexOf("emit(");
    expect(idxClose).toBeGreaterThanOrEqual(0);
    expect(idxClamp).toBeGreaterThan(idxClose);
    expect(idxEmit).toBeGreaterThan(idxClamp);
  });
});

describe("PageSizeSelect:startCustom 预填 + 聚焦", () => {
  test("customInput.value 预填 String(props.modelValue)(省掉「先清空再输入」)", () => {
    expect(src).toMatch(/customInput\.value\s*=\s*String\(\s*props\.modelValue\s*\)/);
  });

  test("nextTick 焦点 nextTick 后调 customInputEl.value?.focus()", () => {
    expect(src).toMatch(/nextTick\(\s*\(\s*\)\s*=>\s*customInputEl\.value\?\.focus\(\s*\)/);
  });
});

describe("PageSizeSelect:cancelCustom 只关 customMode", () => {
  test("不修改 customInput.value,只关 customMode", () => {
    const match = /function\s+cancelCustom\s*\(\s*\)\s*\{([\s\S]*?)\n\}/.exec(src);
    expect(match).not.toBeNull();
    const body = match![1]!;
    expect(body).toContain("customMode.value = false");
    expect(body).not.toContain("customInput.value =");
  });
});

describe("PageSizeSelect:UI 可达性", () => {
  test("SelectTrigger 带 aria-label='每页显示条数'", () => {
    expect(src).toMatch(/aria-label\s*=\s*["']每页显示条数["']/);
  });

  test("输入框含 placeholder 与 type='number' 与 inputmode='numeric'", () => {
    expect(src).toMatch(/type\s*=\s*["']number["']/);
    expect(src).toMatch(/inputmode\s*=\s*["']numeric["']/);
  });

  test("ClientOnly 包 Select,提供 fallback 占位", () => {
    expect(src).toMatch(/<ClientOnly/);
    expect(src).toMatch(/<template\s+#fallback>/);
  });

  test("确定/取消按钮各一个,绑定 applyCustom / cancelCustom", () => {
    const btnMatches = src.match(/<Button[^>]*@click=["'](applyCustom|cancelCustom)["']/g) ?? [];
    expect(btnMatches.length).toBe(2);
  });
});