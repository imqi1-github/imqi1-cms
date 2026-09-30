/**
 * PageSizeSelect.vue 源码字面量断言:锁定关键不变式
 *  - 哨兵值 CUSTOM_OPTION = "custom" 一致贯穿
 *  - 预设档 + 自定义档 + 当前 modelValue 都不在预设时插入(防 SelectValue 找不到项)
 *  - 全部选项 value 是字符串(避免 reka-ui number/string 混用触发空白)
 *  - 自定义输入预填当前 modelValue(省掉「先清空再输入」)
 *  - 接受 emit("update:modelValue") 调用 clampAdminPageSize,避免上游漏包
 *  - keydown.enter → applyCustom, keydown.esc → cancelCustom(键盘可达性)
 */
import { readFileSync } from "node:fs";

import { describe, expect, test } from "bun:test";

const src = readFileSync("app/components/admin/PageSizeSelect.vue", "utf8");

describe("PageSizeSelect:哨兵与选项 value 类型", () => {
  test("CUSTOM_OPTION 哨兵必须是字符串 \"custom\"", () => {
    expect(src).toMatch(/const\s+CUSTOM_OPTION\s*=\s*["']custom["']/);
  });

  test("options 列表里 CUSTOM_OPTION 项的 value 用哨兵本身(不要复用 modelValue)", () => {
    // 模式:{ value: CUSTOM_OPTION, label: "自定义…" }
    expect(src).toMatch(/value:\s*CUSTOM_OPTION\s*,\s*label:\s*["']自定义…/);
  });

  test("预设档转 value 时用 String(size),不裸 number 写(防 reka-ui 匹配失败)", () => {
    expect(src).toMatch(/value:\s*String\(\s*size\s*\)/);
  });

  test("modelValue 不在预设档时也要作为一项插进列表(否则 SelectValue 找不到匹配)", () => {
    // splice(1, 0, ...) 插入位置在预设档之后,自身档位之前
    expect(src).toMatch(/splice\(\s*1\s*,\s*0\s*,\s*\{\s*value:\s*String\(\s*props\.modelValue\s*\)/);
  });
});

describe("PageSizeSelect:customMode 状态机", () => {
  test("startCustom:预填当前 modelValue + 切 customMode + 下一帧聚焦", () => {
    const match = /function\s+startCustom\s*\(\s*\)\s*\{([\s\S]*?)\n\}/.exec(src);
    expect(match).not.toBeNull();
    const body = match![1]!;
    expect(body).toMatch(/customInput\.value\s*=\s*String\(\s*props\.modelValue\s*\)/);
    expect(body).toMatch(/customMode\.value\s*=\s*true/);
    expect(body).toMatch(/nextTick\(\s*\(\s*\)\s*=>\s*customInputEl\.value\?\.focus\(\s*\)/);
  });

  test("applyCustom:走 clampAdminPageSize 钳值,相等不 emit(避免无意义写回)", () => {
    const match = /function\s+applyCustom\s*\(\s*\)\s*\{([\s\S]*?)\n\}/.exec(src);
    expect(match).not.toBeNull();
    const body = match![1]!;
    expect(body).toMatch(/clampAdminPageSize\(\s*customInput\.value\s*,\s*props\.modelValue\s*\)/);
    expect(body).toMatch(/if\s*\(\s*size\s*!==\s*props\.modelValue\s*\)/);
    expect(body).toMatch(/emit\(\s*["']update:modelValue["']\s*,\s*size\s*\)/);
  });

  test("cancelCustom:仅关 customMode,不改输入", () => {
    const match = /function\s+cancelCustom\s*\(\s*\)\s*\{([\s\S]*?)\n\}/.exec(src);
    expect(match).not.toBeNull();
    expect(match![1]).toContain("customMode.value = false");
  });
});

describe("PageSizeSelect:键盘可达性", () => {
  test("输入框监听 keydown.enter → applyCustom + keydown.esc → cancelCustom", () => {
    expect(src).toMatch(/@keydown\.enter\s*=\s*["']applyCustom["']/);
    expect(src).toMatch(/@keydown\.esc\s*=\s*["']cancelCustom["']/);
  });
});

describe("PageSizeSelect:aria 与 min/max 透传", () => {
  test("输入框带 aria-label,动态引用 MIN/MAX", () => {
    expect(src).toMatch(/aria-label[^>]*\$\{ADMIN_PAGE_SIZE_MIN\}/);
    expect(src).toMatch(/\$\{ADMIN_PAGE_SIZE_MAX\}/);
    expect(src).toMatch(/每页条数/);
  });

  test("输入框 min/max 属性透传常量", () => {
    expect(src).toMatch(/min\s*=\s*["']ADMIN_PAGE_SIZE_MIN["']/);
    expect(src).toMatch(/max\s*=\s*["']ADMIN_PAGE_SIZE_MAX["']/);
  });
});