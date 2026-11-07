---
name: image-lightbox-top-layer-dialog
description: 自研灯箱（原生 <dialog>+showModal 进 top layer、useState 单例、document 委派按 data-lightbox 分组、实况照片直渲 LivePhoto）与切图动画的踩坑清单
metadata:
  type: project
---

# 图片灯箱 = 自研 top-layer dialog

`@fancyapps/ui@6` 是**商业许可**（npm license 字段 `SEE LICENSE IN LICENSE.md`），故整体自研；宽松许可的库都没有旋转/翻转（PhotoSwipe 5 是 MIT 但无 rotate/flip）。

## 架构（改灯箱代码前先读）

- `app/components/Lightbox.vue`（全局单例，`app.vue` 里挨着 `<Toaster>` 挂一次）+ `app/composables/useLightbox.ts`（状态）+ `app/types/composables/lightbox.d.ts` + `app/assets/css/lightbox.css`。范式照抄 `useConfirm`/`ConfirmDialog`：Nuxt **`useState`** 承载共享状态，模块级 `let` 只放 DOM 引用。
- **渲染进原生 `<dialog>` + `showModal()`** → 进浏览器 top layer，**天然盖住 z-9999 的页脚悬浮按钮**，并白拿 ESC（`cancel` 事件）、焦点陷阱、背景 inert ⇒ 完全绕开仓库那套 z-index 分层（Dialog/Sheet 是 z-200/201）。`::backdrop` 故意留透明，模糊+底色交给内部 `.lb-backdrop`。
- **触发契约 `data-lightbox="gallery"`**。改名必须**四处一致**：渲染器（`server/utils/markdown.ts`、`useMarkdownWidgets`）、净化白名单（`shared/html.ts` 的 `ADD_ATTR`）、客户端（`useMarkdownImages`）、解析器（`useLightbox` 的 `closest/getAttribute/querySelector`）——**漏掉白名单会被 sanitize 剥掉**。
- 页面侧只调 `register(container)` / `unregister(container)`，**不 bind**；点击走 document 委派、点击时才查 `[data-lightbox]` ⇒ Markdown 事后注入 DOM 的图片照样生效。`findScope` 取**最深**的已注册容器（封面轮播自己也注册），不随 onMounted 次序漂移。
- 实况照片：灯箱里**直接渲染 `LivePhoto.vue`**（`:hover-play="false"`）。滑片识别靠 LivePhoto 注入的 `data-live-photo` 标记——**别想从 `<img src>` 反推**（live 分支的 img 渲染的是剥掉 `#live` 的干净地址）。

## 切图动画

- `LightboxTransition`（`app/types/composables/lightbox.d.ts`）存出场层参数；位移走 `.lb-root` 上的 CSS 变量（`--lb-slide-from` / `--lb-out-from` / `--lb-out-to`、`--lb-switch-ms`），插值走 keyframes。入场层 `.lb-slide-track` 与出场层 `.lb-outgoing` 的位移**恒差一个屏宽**，中途才不露底色；拖拽松手时 `switchFromX`/`switchDir` 交接给动画当起点。
- **说明文字要跟图一起动** ⇒ 多包一层 `.lb-caption-track` 承载行内位移。`.lb-caption` 自带 `animation-fill-mode: both` 的淡入，**动画优先级高于行内样式** → 行内 opacity 会被永久压住。同理 **track 上的拖动位移只能用 `translate` 属性、不能用 `transform`**（切图动画动的就是 transform，fill-mode: both 播完还压着行内值 ⇒ 「切图后 300ms 内再拖动」说明文字纹丝不动）。`translate` 与 `transform` 是并列属性，互不覆盖。
- 关闭序列开头要 `endTransition()`：切完 300ms 内就关闭时，否则出场层以全不透明度继续滑，且 `is-sliding`/`is-alt` 的特异性会盖掉关闭淡出、说明文字闪一下。
- `lastRendered.aspect` 要在 `onMediaLoaded` 里回填（切到某张时图还没加载，`intrinsicOverride` 刚被清、尺寸缓存可能也没有，否则记成 16:9 兜底 → 下次切走时出场层按错误比例铺开，肉眼可见地跳）。
- **切图判定键必须是「索引 + 地址」**（`switchKey`）：只认 `cleanSrc` 时，同一张图在画廊里出现两次（正文重复引用很常见）换过去地址不变 → 整段处理被跳过，画面纹丝不动而计数/缩略图选中态都变了。
- **连点切图动画不重播**：类名没变时浏览器不重放 → 看着像瞬移。故 `switchAlt` 每次过渡翻转，`is-alt` 选中同内容的另一份 keyframes，只覆盖 `animation-name`（靠多一个类名把特异性顶上去）。
- 该 watcher 用 `flush: 'post'`：过渡要按**换图后**的舞台尺寸与缩略图条位置算（说明文字在流内、会撑矮舞台），pre 阶段量到的是旧布局。
- 实况照片播到一半切图会整块透明：灯箱按位置复用同一个 LivePhoto 实例（只换 src）⇒ LivePhoto 内部 `watch(cleanSrc)` 必须停播并退回静态图，否则 `isPlaying` 仍为真、图片层停在 `opacity:0` 而下层 `<video>` 已换源不再出帧；卸载时的停播挂 `beforeUnmount`。

## 三个易再犯的坑

1. `goTo` 给 state 赋的是**新对象** ⇒ `watch(state)` 在**切图时也会触发**。用一个 watcher + `opened` 标志区分「开 / 关 / 同画廊切图」：切图只同步内容，不重放开场动画（否则每切一张白屏 350ms）。
2. **关闭序列读不到值**：`close()` 先把 state 置 null ⇒ `index`/`current`/`intrinsic`/`visual` 立刻归零（比例退化 16:9）、计数跳成 `m/0`。故渲染与几何**一律读冻结快照 `display`**（打开时写入、关闭动画播完才清），`state` 只用于判断开合跳变。
3. **动画用 CSS `animation`，不要 `transition` + 双 rAF 编排**：元素本帧新建时 animation 插入即播；transition 得先落一帧初始状态，要 `rAF(rAF(…))` 手工编排——而这段编排在**关闭路径里实测根本不执行**（dataset 探针证实回调一次都没进），开合会冻在起始帧。开合（两个 keyframes + `--lb-morph-away`）、切图交叉淡化、进出场淡入淡出**全走 animation**。

## 测动画的两个环境陷阱（判「动画没跑」前先看这里）

- playwright 那台：合成器不产帧 → `transform`/`opacity` 这类**合成器线程**属性的 `currentTime` 恒为 0（用 `el.getAnimations()[0].currentTime` 判定），而主线程属性（如 `background-color`）照常过渡 ⇒ 现象自相矛盾。
- chrome-devtools 那台：宿主 OS 开了「减少动态效果」→ CSS 媒体查询把动画关掉；**JS patch `matchMedia` 影响不到 CSS 媒体查询**，要注入 `!important` 覆盖才能观测。

## 其它要点

- 全局 `img { @apply dark:brightness-75 }`（main.css）会压暗照片，靠 `html .lb-dialog img { filter: none }` 提特异性盖掉。
- 滚动锁定用 `html.with-lightbox` + JS 实测滚动条宽度写 `--lb-scrollbar-width`。
- 触发元素多是 `<img>`（不可聚焦），打开时补 `tabindex="-1"` 才能关闭后把焦点还回去。
- 灯箱图标点击后才渲染、SSR 覆盖不到，已列进 nuxt.config 的 `icon.clientBundle.icons`，否则首次打开逐个回退 `/api/_nuxt_icon` 会闪。
- 行为统一：`links`/`messages` 原先的精简模板 + `trapFocus/placeFocusBack: false` 已废弃，现在都是完整灯箱（工具栏、焦点陷阱与归还）；`agreement.vue` 原先从未注册容器（正文图片点不开），现已补 `register`。

## 两个 Vue/浏览器陷阱

- **模板 ref 在 `onUnmounted` 里已经是 `null`**：`runtime-core` 的 `unmount()` 中 `setRef(ref, null, …, true)` 跑在 `unmountComponent()` **之前** ⇒ `onUnmounted(() => unregister(lightboxContainer.value))` 传的是 null、注销成空操作 → 模块级 `containers` Set 永不收缩（每次离开注册页留下一整棵已分离 DOM），且「容器没了就关灯箱」的保险失效（开着灯箱按后退，灯箱留在新页且仍是 modal，新页完全点不动）。**正确写法：挂载时 `let el = ref.value` 留存元素本身，卸载时传 `el`**；`findScope` 另加 `!isConnected` 兜底剔除。
- **`dialog.close()` 之后再 `focus()` 里面元素是静默失败**（dialog 已 `display:none`）。焦点归还跑在 `close` 事件里，此时若先试「聚焦当前缩略图」并在 `isConnected` 为真时直接 `return`，会跳过兜底、焦点掉到 `body`。必须**确认 `document.activeElement === 目标` 再 return**，否则退到原图（并给它补 `tabindex="-1"`）。
- 指针捕获会把拖拽后的 `click` 重定向到捕获元素（舞台）→「拖完松手」被当成「点空白关闭」，要用「本手势是否移动过」区分（6px 容差），且该标记必须在**命中交互控件提前 return 之前**清；实况照片内部 `img` 缺 `-webkit-user-drag:none` 会被浏览器原生拖图抢走手势、`pointermove` 直接停发（`@dragstart.prevent` 兜 Firefox）。

相关：[[livephoto-firefox-hevc-degrade]]、[[livephoto-video-blob-cache]]、[[cdn-edgeone-purge-and-cache-migration]]
