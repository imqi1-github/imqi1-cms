---
name: image-lightbox-top-layer-dialog
description: "灯箱 2026-09-10 起自研 `<Lightbox>`(替代商用许可的 Fancybox):原生 <dialog>+showModal 进 top layer、useState 单例、delegation 按 data-fancybox 分组、LivePhoto 直接渲染"
metadata:
  node_type: memory
  type: project
---

`@fancyapps/ui@6` 是**商业许可**(npm license 字段 `SEE LICENSE IN LICENSE.md`,官方 #1837 已放弃 GPL 双许可),且仓库还内联分发了它的样式表,故 2026-09-10 整体换成自研灯箱。宽松许可的库都没有旋转/翻转(PhotoSwipe 5 是 MIT 但无 rotate/flip),故自研。

**架构(改灯箱相关代码前先读)**
- `app/components/Lightbox.vue`(全局单例,`app.vue` 里挨着 `<Toaster>` 挂一次)+ `app/composables/useLightbox.ts`(状态)+ `app/types/composables/lightbox.d.ts` + `app/assets/css/lightbox.css`。范式照抄 `useConfirm`/`ConfirmDialog`:Nuxt **`useState`** 承载共享状态,模块级 `let` 只放 DOM 引用。
- **渲染进原生 `<dialog>` + `showModal()`**:进浏览器 top layer,**天然盖住 z-9999 的页脚悬浮按钮**,并白拿 ESC(`cancel` 事件)、焦点陷阱、背景 inert——因此完全绕开了仓库那套 z-index 分层(Dialog/Sheet 是 z-200/201)。这是 Fancybox 原本的做法(vendored CSS 里的 `.fancybox__dialog`/`::backdrop` 就是证据)。`::backdrop` 故意留透明,模糊+底色交给内部 `.lb-backdrop`,开合只过渡普通元素 opacity。
- **触发契约仍是 `data-fancybox="gallery"`**,故意不改名:markdown 渲染是**读时**生成(`renderMarkdown` 在 GET handler 里调),但响应有 ISR 缓存,改名要等缓存失效;而标记本身只是惰性 DOM 钩子、不涉许可。
- 页面侧只调 `register(container)` / `unregister(container)`,**不 bind**。点击走 document 委派、点击时才查 `[data-fancybox]`,故 Markdown 事后注入 DOM 的图片照样生效。`findScope` 取**最深**的已注册容器(封面轮播自己也注册),不随 onMounted 先后次序漂移。
- 实况照片:灯箱里**直接渲染 `LivePhoto.vue`**(`:hover-play="false"`),由此删掉了 400 行往 Fancybox 幻灯片里手插 DOM 的 `useFancyboxLivePhoto.ts` 与 `.flp-*` CSS。滑片识别靠 LivePhoto 注入的 `data-live-photo` 标记——**别想从 `<img src>` 反推**:live 分支的 img 渲染的是剥掉 `#live` 的干净地址。

**三个已踩的坑(重写时别再犯)**
1. `goTo` 给 state 赋的是**新对象**,所以 `watch(state)` 在**切图时也会触发**。现在用一个 watcher + `opened` 标志区分「开 / 关 / 同画廊切图」:切图只同步内容,不重放开场动画(否则每切一张就白屏 350ms)。
2. **关闭序列读不到值**:`close()` 先把 state 置 null,`index`/`current`/`intrinsic`/`visual` 立刻归零(比例退化成 16:9 兜底),计数还会跳成 `m/0`。故渲染与几何**一律读冻结快照 `display`**(ConfirmDialog 同款:打开时写入、关闭动画播完才清),`state` 只用来判断开合跳变。
3. **动画用 CSS `animation`,不要 `transition` + 双 rAF 编排**:元素本帧新建时 animation 插入即播;transition 得先落一帧初始状态,于是要 `rAF(rAF(…))` 手工编排——而这段编排在**关闭路径里实测根本不执行**(原因未查明,dataset 探针证实回调一次都没进),开合会冻在起始帧。开合(两个 keyframes + `--lb-morph-away`)、切图交叉淡化、进出场淡入淡出**全走 animation**;元素新建即播,不需要手工时序。

**测动画的两个环境陷阱(判定"动画没跑"前先看这里)**
- playwright 那台:合成器不产帧 → `transform`/`opacity` 这类**合成器线程**属性的 `currentTime` 恒为 0(用 `el.getAnimations()[0].currentTime` 判定),而主线程属性(如 `background-color`)照常过渡 —— 现象会自相矛盾。
- chrome-devtools 那台:宿主 OS 开了「减少动态效果」→ CSS 媒体查询把动画关掉;**JS patch `matchMedia` 影响不到 CSS 媒体查询**,要注入 `!important` 覆盖才能观测。

**其他要点**
- 全局 `img { @apply dark:brightness-75 }`(main.css)会压暗照片,靠 `html .lb-dialog img { filter: none }` 提特异性盖掉。
- 滚动锁定从 `html.with-fancybox` 改为 `html.with-lightbox` + JS 实测滚动条宽度写 `--lb-scrollbar-width`(替掉原来写死的 `margin-right: 8px`)。
- 触发元素多是 `<img>`(不可聚焦),打开时补 `tabindex="-1"` 才能在关闭后把焦点还回去。
- 灯箱图标是点击后才渲染、SSR 永远覆盖不到,已列进 nuxt.config 的 `icon.clientBundle.icons`,否则首次打开逐个回退 `/api/_nuxt_icon` 会闪。

**行为变化**:`links`/`messages` 原先传的 `tpl.main` 精简模板 + `trapFocus/placeFocusBack: false` 是残留配置,现在统一成完整灯箱(有工具栏、焦点陷阱与归还)。`agreement.vue` 原先从未注册过容器(正文图片点不开),现已补上 `register`。

**两个 Vue/浏览器陷阱(改这块极易再犯)**
- **模板 ref 在 `onUnmounted` 里已经是 `null`**:`runtime-core` 的 `unmount()` 中 `setRef(ref, null, …, true)` 跑在 `unmountComponent()` **之前**。所以 `onUnmounted(() => unregister(lightboxContainer.value))` 传进去的是 null、注销成空操作 → 模块级 `containers` Set 永不收缩(每次离开注册页留下一整棵已分离 DOM),且「容器没了就关灯箱」的保险失效(开着灯箱按浏览器后退,灯箱会留在新页面上且仍是 modal,新页面完全点不动)。**正确写法:挂载时 `let el = ref.value` 留存元素本身,卸载时传 `el`**;`findScope` 另加 `!isConnected` 兜底剔除。
- **`dialog.close()` 之后再 `focus()` 里面的元素是静默失败**(dialog 已 `display:none`)。焦点归还跑在 `close` 事件里,此时若先试"聚焦当前缩略图"并在 `isConnected` 为真时直接 `return`,会跳过兜底、焦点掉到 `body`。必须**确认 `document.activeElement === 目标` 再 return**,否则退到原图(并给它补 `tabindex="-1"`)。
- 另:指针捕获会把拖拽后的 `click` 重定向到捕获元素(舞台)→「拖完松手」被当成「点空白关闭」,要用「本手势是否移动过」区分(6px 容差),且这个标记必须在**命中交互控件提前 return 之前**清。以及实况照片内部 `img` 缺 `-webkit-user-drag:none` 会被浏览器原生拖图抢走手势、`pointermove` 直接停发(`@dragstart.prevent` 兜 Firefox)。

相关:[[livephoto-firefox-hevc-degrade]] [[single-user-site-invariant]]
