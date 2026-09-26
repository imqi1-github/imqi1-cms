import { readFileSync } from "node:fs";
import { resolve } from "node:path";

import { afterEach, beforeEach, describe, expect, test } from "bun:test";
import { Window } from "happy-dom";

import { useEmojiRichInput } from "~/composables/useEmojiRichInput";
import { buildEmojiPlaceholder, getEmojiByKey } from "~/utils/emoji";

// readDom 是 useEmojiRichInput 内部纯函数:遍历 DOM → `:[key]` 字符串。
// 没导出 → 通过读源码 + eval 函数体取出来测(去掉 TS `!` 非空断言,Function 构造器不认)。
// 等价复制一份到测试,源码改函数体时若不一致测试会失败(字符串 match 抛错)。
function callReadDom(root: HTMLElement, isTopLevel = true): string {
  const src = readFileSync(
    resolve(__dirname, "../../../app/composables/useEmojiRichInput.ts"),
    "utf8",
  );
  // 函数体以 `function readDom(root: HTMLElement, isTopLevel = true): string {` 开头
  const start = src.indexOf("function readDom(root:");
  if (start < 0) throw new Error("readDom 源码未找到");
  // 函数体的闭合 `}` 在 0 缩进行首,匹配到换行后无缩进的 `}` 即函数结尾(避开内层 for/if 的 close)
  const bodyMatch = src.slice(start).match(/function readDom[\s\S]*?\n\}/);
  if (!bodyMatch) throw new Error("readDom 函数体未匹配,请检查结构");
  // 去掉 TS 类型注解:`!` 非空断言、`as Type` 断言、TS 函数返回类型 `: string`
  // 把函数体内对 readDom 的递归调用替换成参数 readDomRef,以便 Function 构造器执行时能拿到
  const cleanBody = bodyMatch[0]
    .replace(/\]!/g, "]")
    .replace(/!(\.|\[)/g, "$1")
    .replace(/ as [A-Za-z<>[\]| ]+/g, "")
    .replace(/\): string \{/g, ") {")
    .replace(/readDom\(/g, "readDomRef(");
  // 提取函数体内部(去掉 `function readDom(...)` 声明 + 函数末尾 `}`)
  const bodyOnly = cleanBody
    .replace(/^function readDom[\s\S]*?\{/, "")
    .replace(/\n\}\s*$/, "");
  // 构造并执行函数,传入外部依赖(getEmojiByKey/buildEmojiPlaceholder/Node/ZWSP_RE + readDomRef)
  const ZWSP = String.fromCodePoint(0x200b);
  const ZWSP_RE = new RegExp(ZWSP, "g");
  const fn = new Function(
    "root", "isTopLevel", "Node", "getEmojiByKey", "buildEmojiPlaceholder", "ZWSP_RE", "readDomRef",
    bodyOnly,
  ) as (...args: unknown[]) => string;
  // readDomRef 指向自身(递归)
  const callFn = (r: HTMLElement, t: boolean) =>
    fn(r, t, Node, getEmojiByKey, buildEmojiPlaceholder, ZWSP_RE, callFn);
  return callFn(root, isTopLevel);
}

let win: Window;

beforeEach(() => {
  win = new Window();
  Object.assign(globalThis, {
    window: win,
    document: win.document,
    Node: win.Node,
    HTMLElement: win.HTMLElement,
  });
});

afterEach(() => {
  win.close();
});

describe("useEmojiRichInput.readDom:DOM → `:[key]` 模型", () => {
  // 注:useEmojiRichInput 主体依赖 import.meta.client / onMounted / watch,本仓库 bun:test
  // 环境下 composable 初始化会触发 Vue dev warnings(no active component instance),
  // 真实使用方有 component setup 上下文。readDom 是核心纯函数,本文件只测它。

  test("纯文本节点原样保留", () => {
    const root = win.document.createElement("div");
    root.appendChild(win.document.createTextNode("hello world"));
    expect(callReadDom(root)).toBe("hello world");
  });

  test("ZWSP(零宽空格)从文本节点剥掉,不进模型", () => {
    const ZWSP = String.fromCodePoint(0x200b);
    const root = win.document.createElement("div");
    root.appendChild(win.document.createTextNode(`a${ZWSP}b${ZWSP}c`));
    expect(callReadDom(root)).toBe("abc");
  });

  test("空文本节点返回空串", () => {
    const root = win.document.createElement("div");
    root.appendChild(win.document.createTextNode(""));
    expect(callReadDom(root)).toBe("");
  });

  test("<br> 在非末尾位置 → \\n;顶层末尾孤立 <br>(bogus-br)忽略", () => {
    const root = win.document.createElement("div");
    root.appendChild(win.document.createTextNode("line1"));
    root.appendChild(win.document.createElement("br"));
    root.appendChild(win.document.createTextNode("line2"));
    // 中间 br → \n
    expect(callReadDom(root)).toBe("line1\nline2");

    // 末尾孤立 br 忽略(Chrome 的 bogus-br)
    const root2 = win.document.createElement("div");
    root2.appendChild(win.document.createTextNode("solo"));
    root2.appendChild(win.document.createElement("br"));
    expect(callReadDom(root2)).toBe("solo");
  });

  test("<br> 在非顶层(嵌套 div)→ \\n(不走 bogus-br 兜底)", () => {
    const inner = win.document.createElement("div");
    inner.appendChild(win.document.createTextNode("a"));
    inner.appendChild(win.document.createElement("br"));
    inner.appendChild(win.document.createTextNode("b"));
    const root = win.document.createElement("div");
    root.appendChild(inner);
    // 嵌套 div → 前后补 \n(防御性)+ 内部 br → \n
    const out = callReadDom(root);
    expect(out).toContain("a");
    expect(out).toContain("b");
    expect(out).toContain("\n");
  });

  test("<img data-emoji-key> 已知 key → 占位符 :[key];未知 key → 跳过", () => {
    const root = win.document.createElement("div");
    const img1 = win.document.createElement("img");
    img1.setAttribute("data-emoji-key", "heo-微笑");
    root.appendChild(img1);
    const img2 = win.document.createElement("img");
    img2.setAttribute("data-emoji-key", "fake-unknown-key");
    root.appendChild(img2);
    root.appendChild(win.document.createTextNode(" after"));

    const out = callReadDom(root);
    expect(out).toContain(":[heo-微笑]");
    expect(out).not.toContain(":[fake-unknown-key]");
    expect(out).toContain("after");
  });

  test("<div>/<p> 块级元素:前后补 \\n(防御性 — 正常 Enter 路径不产生 div/p)", () => {
    const block = win.document.createElement("div");
    block.appendChild(win.document.createTextNode("inner"));
    const root = win.document.createElement("div");
    root.appendChild(win.document.createTextNode("before"));
    root.appendChild(block);
    root.appendChild(win.document.createTextNode("after"));

    const out = callReadDom(root);
    expect(out).toMatch(/before\ninner\nafter/);
  });

  test("<span> 等行内包裹 → 递归取文本,不补 \\n", () => {
    const span = win.document.createElement("span");
    span.appendChild(win.document.createTextNode("wrapped"));
    const root = win.document.createElement("div");
    root.appendChild(win.document.createTextNode("a"));
    root.appendChild(span);
    root.appendChild(win.document.createTextNode("b"));
    expect(callReadDom(root)).toBe("awrappedb");
  });

  test("混合场景:文本 + br + img + div 嵌套", () => {
    const root = win.document.createElement("div");
    root.appendChild(win.document.createTextNode("hello"));
    root.appendChild(win.document.createElement("br"));
    const img = win.document.createElement("img");
    img.setAttribute("data-emoji-key", "heo-微笑");
    root.appendChild(img);
    const block = win.document.createElement("div");
    block.appendChild(win.document.createTextNode("inside"));
    root.appendChild(block);

    const out = callReadDom(root);
    expect(out).toContain("hello");
    expect(out).toContain("\n");
    expect(out).toContain(":[heo-微笑]");
    expect(out).toContain("inside");
  });
});