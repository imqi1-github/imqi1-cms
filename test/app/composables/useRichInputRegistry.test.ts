import { afterEach, beforeEach, describe, expect, test } from "bun:test";
import { Window } from "happy-dom";

import {
  findRichInputHandle,
  registerRichInput,
  unregisterRichInput,
} from "~/composables/useRichInputRegistry";

let win: Window;

beforeEach(() => {
  win = new Window();
  Object.assign(globalThis, {
    document: win.document,
    HTMLElement: win.HTMLElement,
  });
});

afterEach(() => {
  win.close();
});

describe("useRichInputRegistry", () => {
  test("register 后 find 能命中同一元素 + 同一 handle", () => {
    const el = win.document.createElement("div");
    el.setAttribute("contenteditable", "true");
    const handle = { focus: () => {} };
    registerRichInput(el, handle);
    const found = findRichInputHandle(el);
    expect(found).not.toBeNull();
    expect(found?.editor).toBe(el);
    expect(found?.handle).toBe(handle);
    unregisterRichInput(el);
  });

  test("unregister 后 find 返回 null", () => {
    const el = win.document.createElement("div");
    el.setAttribute("contenteditable", "true");
    registerRichInput(el, { id: "x" });
    unregisterRichInput(el);
    expect(findRichInputHandle(el)).toBeNull();
  });

  test("未注册的元素 find 返回 null", () => {
    const el = win.document.createElement("div");
    el.setAttribute("contenteditable", "true");
    expect(findRichInputHandle(el)).toBeNull();
  });

  test("target 是编辑器内后代时,closest 找到编辑器根 + 反查 handle", () => {
    const editor = win.document.createElement("div");
    editor.setAttribute("contenteditable", "true");
    const inner = win.document.createElement("span");
    inner.textContent = "hello";
    editor.appendChild(inner);
    win.document.body.appendChild(editor);

    const handle = { foo: "bar" };
    registerRichInput(editor, handle);
    const found = findRichInputHandle(inner);
    expect(found?.editor).toBe(editor);
    expect(found?.handle).toBe(handle);

    unregisterRichInput(editor);
  });

  test("target 是非 contenteditable 父节点 → 返回 null", () => {
    const wrapper = win.document.createElement("div");
    const inner = win.document.createElement("span");
    wrapper.appendChild(inner);
    expect(findRichInputHandle(inner)).toBeNull();
  });

  test("target 是 contenteditable=false(表情图占位)→ closest 跳过 false 节点找 true 根,命中 handle", () => {
    // 表情图是 contenteditable="false",但 closest('[contenteditable="true"]') 会
    // 跳过 false 节点找外层 true 根 → 注册过的 editor 应命中
    const editor = win.document.createElement("div");
    editor.setAttribute("contenteditable", "true");
    const emoji = win.document.createElement("span");
    emoji.setAttribute("contenteditable", "false");
    editor.appendChild(emoji);
    registerRichInput(editor, { id: "x" });

    const found = findRichInputHandle(emoji);
    expect(found?.editor).toBe(editor);

    unregisterRichInput(editor);
  });

  test("null target → 返回 null(不抛)", () => {
    expect(findRichInputHandle(null)).toBeNull();
  });

  test("register 同一元素多次 → 后者覆盖前者", () => {
    const el = win.document.createElement("div");
    el.setAttribute("contenteditable", "true");
    registerRichInput(el, { v: 1 });
    registerRichInput(el, { v: 2 });
    expect((findRichInputHandle(el)?.handle as { v: number }).v).toBe(2);
    unregisterRichInput(el);
  });

  test("unregister 一个未注册的元素 → 不抛,后续 register 仍正常", () => {
    const el = win.document.createElement("div");
    el.setAttribute("contenteditable", "true");
    expect(() => unregisterRichInput(el)).not.toThrow();
    registerRichInput(el, { v: "x" });
    expect(findRichInputHandle(el)).not.toBeNull();
    unregisterRichInput(el);
  });
});