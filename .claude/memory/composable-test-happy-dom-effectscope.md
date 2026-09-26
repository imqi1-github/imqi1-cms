---
name: composable-test-happy-dom-effectscope
description: app/composables 测试用 happy-dom Window + effectScope 触发 Vue lifecycle;Vue dev "no active component instance" 警告过滤;import.meta.client 模块级不可在测试改。
metadata:
  type: reference
---

**happy-dom 起步 + DOM 挂 globalThis**:每个 test 起新 `Window()` 实例 + `beforeEach` 把它挂到 `globalThis.window/document/ResizeObserver/requestAnimationFrame/matchMedia/addEventListener/...`。一次性 Window 跨 test 会被 ResizeObserver/scroll listener 残留污染。`afterEach` 调 `win.close()`。`happy-dom` 已加 devDependency。

**element 布局尺寸必须 Object.defineProperty 强写**:happy-dom 默认 clientHeight/scrollHeight 都是 0 或相等,不会触发"内容超出"分支。`Object.defineProperty(el, 'scrollHeight', {configurable, value: 300})` 这套最稳。

**Vue 生命周期警告过滤**:`onMounted/onUnmounted` 在 setup 外调用,Vue dev 模式 console.warn 刷屏。两种解法,选一:
1. `const scope = effectScope(); const r = scope.run(() => useComposable(...)); scope.stop()` —— 把 onMounted 包进当前 scope,**但 scope.stop() 在 finally 会断开 watch 响应** → 需要后续触发响应的测试不能 finally stop,要把 scope 延后到测试结束才 stop。
2. `const origWarn = console.warn; beforeEach(() => { console.warn = (...a) => a[0]?.startsWith?.('[Vue warn]') ? undefined : origWarn(...a) })` —— 简单粗暴,无视 warning,只过滤 [Vue warn] 前缀不影响其它。

**Vue 真实 watch 与 mock.globalThis 的 stub watch 不可混用**:`app/composables/*.ts` 内 `import { ref, watch } from 'vue'`(实 vue)与全局 stub `watch = () => {}` 是两套。`Vue warn: Invalid watch source: { value: null }` 表示 source 不是真 ref——必须 `ref(null)`(从 'vue')而非 `{ value: null }`。flush:'post' watch 需 `await nextTick()` 才触发。

**busy / setTimeout 0 vs await Promise.resolve()**:useEditorAutosave 类的并发测试,`saveNow("manual")` 后 `release()` 必须等 refreshCsrf 微任务跑完才能调到 save —— 单 `await Promise.resolve()` 不够(顺序不可控),用 `await new Promise(r => setTimeout(r, 10))` 最稳。

**import.meta.client 在 bun:test 无法改**:这是模块级 Vite 编译期常量,bun:test 默认 undefined。测试顶层 `import.meta.client = true` 改的是测试模块的 meta,**源码模块独立**,改不到。`Bun.plugin` 在 `app/composables/*.ts` 注 `import.meta.client = true` 会污染 tsc/eslint + 破坏 mock.module 链(见 [[bun-mock-module-leak-zz-late-layout]])。结论:依赖 `import.meta.client` 真值的代码(如 useMarkdownTableTranspose.mount 的 client 守卫、useAdminPageSize 的 readStored/watch)无法在 bun:test 触发真实分支,fallback 路径覆盖即可,client 分支靠手工 dev 验证。

**happy-dom type clash**:happy-dom 自带 HTMLElement 类型,import 后遮蔽全局同名,test 文件中 `as unknown as HTMLElement` 需 `InstanceType<typeof win.HTMLElement>` 拿实例类型而非 global HTMLElement。

**cancelAnimationFrame 类型**:happy-dom 期待 `Immediate`(Node.js setImmediate 返回值),不是 number。cast `as unknown as never` 或用 `(handle: number) => win.cancelAnimationFrame(handle as never)` 解决 typecheck。