// app/lib/aplayer/utils.ts 顶层用 window.navigator.userAgent(检测 isMobile)
// + utils.storage / Storage 都依赖 localStorage;happy-dom 提供这些,但 globalThis 没自动挂。
// 每个 aplayer 测试文件首行 import 此模块(es 模块按文本顺序求值,先于后续 import)。
import { Window } from "happy-dom";

const win = new Window();
Object.assign(globalThis, {
  window: win,
  navigator: win.navigator,
  document: win.document,
  HTMLElement: win.HTMLElement,
  localStorage: win.localStorage,
});

export {};