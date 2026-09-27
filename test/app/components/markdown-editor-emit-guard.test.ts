/**
 * MarkdownEditor 编辑→模型回写 guard(记忆 markdown-editor-save-revert-writeback):
 * 根因:MD 模式打字只更新 model(textarea v-model),旧 tiptap doc 仍是编辑前内容。
 *      保存后 emitMarkdown/onBeforeUnmount.writeMarkdownOut 把过期 tiptap 写回 model → 覆盖成编辑前。
 * 修复:
 *  ① emitMarkdown 加 `if (viewMode.value !== "rich") return;`(还兼 suppressEmit 守卫)
 *  ② onBeforeUnmount 改为 `if (suppressEmit.value || viewMode.value !== "rich") return;` 再 try/catch
 *  ③ flush 的 md 分支同步 `model.value = ta.value` 时也更新 `lastEmitted.value`
 *
 * 由于 MarkdownEditor.vue 是 SFC,组件级 mount/e2e 成本太高,本测试通过源码字面量守卫
 * 锁住关键修复点(类似 travelmap zooms 不变式守卫)。
 */
import { readFileSync } from "node:fs";

import { describe, expect, test } from "bun:test";

const src = readFileSync("app/components/MarkdownEditor.vue", "utf8");

describe("MarkdownEditor:emitMarkdown 必须在 viewMode !== \"rich\" 时短路", () => {
  test("emitMarkdown 函数体内必须同时含 suppressEmit 与 viewMode 守卫", () => {
    // 模式:const emitMarkdown = useDebounceFn(() => { ... if (suppressEmit.value) return; ... if (viewMode.value !== "rich") return; writeMarkdownOut(); }, ...);
    const match = /const\s+emitMarkdown\s*=\s*useDebounceFn\(\s*\(\)\s*=>\s*\{([\s\S]*?)\}\s*,\s*\d+\s*\)/.exec(src);
    expect(match).not.toBeNull();
    const body = match![1]!;
    expect(body).toMatch(/suppressEmit\.value/);
    expect(body).toMatch(/viewMode\.value\s*!==\s*["']rich["']/);
    expect(body).toContain("writeMarkdownOut()");
  });

  test("onUpdate 钩子必须走 emitMarkdown(有守卫),不直接 writeMarkdownOut", () => {
    // onUpdate: () => { emitMarkdown(); } —— 防回归:不要直接调 writeMarkdownOut
    const match = /onUpdate:\s*\(\s*\)\s*=>\s*\{([\s\S]*?)\}/.exec(src);
    expect(match).not.toBeNull();
    const body = match![1]!;
    expect(body).toContain("emitMarkdown");
    expect(body).not.toContain("writeMarkdownOut");
  });
});

describe("MarkdownEditor:onBeforeUnmount 必须有双守卫 + try/catch 兜底", () => {
  test("onBeforeUnmount 内首句守卫:suppressEmit OR viewMode !== rich", () => {
    const match = /onBeforeUnmount\(\s*\(\)\s*=>\s*\{([\s\S]*?)\n\}\)/.exec(src);
    expect(match).not.toBeNull();
    const body = match![1]!;
    // 守卫语句(可能在头部清理 window listener 之后):含 suppressEmit 与 viewMode 同时
    expect(body).toMatch(/suppressEmit\.value/);
    expect(body).toMatch(/viewMode\.value\s*!==\s*["']rich["']/);
  });

  test("writeMarkdownOut 调用在 try/catch 内(卸载时抛错不向上传)", () => {
    const match = /onBeforeUnmount\(\s*\(\)\s*=>\s*\{([\s\S]*?)\n\}\)/.exec(src);
    expect(match).not.toBeNull();
    const body = match![1]!;
    // 守卫之后必须是 try { writeMarkdownOut() } catch { ... }
    const guardIdx = body.search(/if\s*\([^)]*suppressEmit\.value[^)]*viewMode\.value\s*!==\s*["']rich["']/);
    expect(guardIdx).toBeGreaterThanOrEqual(0);
    const afterGuard = body.slice(guardIdx);
    expect(afterGuard).toMatch(/try\s*\{[\s\S]*writeMarkdownOut\(\)/);
    expect(afterGuard).toMatch(/catch\s*\{/);
  });
});

describe("MarkdownEditor:flush.md 分支同步 lastEmitted", () => {
  test("useEditor 选项里 flush 函数存在", () => {
    // flush 是 useEditor 选项的一个字段,不是顶层 const
    expect(src).toMatch(/flush:\s*async\s*\(\s*\)\s*=>\s*\{/);
  });

  test("flush 的 viewMode === \"md\" 分支同时写 model.value 与 lastEmitted.value", () => {
    // 在 flush 函数体内,if (viewMode.value === \"md\") 块必须同时含两个赋值
    // 模式(简化):if (viewMode.value === "md") { ... model.value = ta.value; lastEmitted.value = ta.value; ... }
    const mdBlocks = [...src.matchAll(/if\s*\(\s*viewMode\.value\s*===\s*["']md["']\s*\)\s*\{([\s\S]*?)\}/g)];
    expect(mdBlocks.length).toBeGreaterThan(0);
    const flushed = mdBlocks.find(m => {
      const body = m[1]!;
      return body.includes("model.value") && body.includes("ta.value") && body.includes("lastEmitted.value");
    });
    expect(flushed).toBeDefined();
  });

  test("flush 函数体内 md + rich 两个分支都写 lastEmitted.value", () => {
    // 抓 flush: async () => { ... 整个函数体
    const startIdx = src.search(/flush:\s*async\s*\(\s*\)\s*=>\s*\{/);
    expect(startIdx).toBeGreaterThanOrEqual(0);
    // 用括号配对找到 flush 体的真正结束
    let depth = 0;
    let bodyStart = -1;
    let bodyEnd = -1;
    for (let i = startIdx; i < src.length; i++) {
      const c = src[i];
      if (c === "{") {
        if (bodyStart === -1) bodyStart = i;
        depth++;
      } else if (c === "}") {
        depth--;
        if (depth === 0 && bodyStart !== -1) {
          bodyEnd = i;
          break;
        }
      }
    }
    expect(bodyEnd).toBeGreaterThan(bodyStart!);
    const flushBody = src.slice(bodyStart!, bodyEnd + 1);
    const lastEmittedAssigns = (flushBody.match(/lastEmitted\.value\s*=/g) ?? []).length;
    const modelAssigns = (flushBody.match(/model\.value\s*=/g) ?? []).length;
    // md + rich 两个分支各写一次 lastEmitted 和 model
    expect(lastEmittedAssigns).toBeGreaterThanOrEqual(2);
    expect(modelAssigns).toBeGreaterThanOrEqual(2);
  });
});

describe("MarkdownEditor:viewMode 双档(rich|md)声明", () => {
  test("viewMode 默认值必须是 rich", () => {
    expect(src).toMatch(/props\.viewMode\s*\?\?\s*["']rich["']/);
  });

  test("viewMode 切换走 watch(viewMode) + 内部按 mode 分支", () => {
    expect(src).toMatch(/watch\s*\(\s*viewMode\s*,/);
  });
});