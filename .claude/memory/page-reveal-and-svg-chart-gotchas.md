---
name: page-reveal-and-svg-chart-gotchas
description: 页面滚动渐入(animationend 移 ready)与图表避坑(SVG rect 几何属性触发 Vue 只读 setter)
metadata: 
  node_type: memory
  type: feedback
  originSessionId: b129f12f-f364-41e9-8430-92e42f799fbf
---

做带滚动渐入 + 图表的页面（如 [[exercise-page-status]]）踩的两个坑，症状都是"整页空白/透明"且不报 error、排查反直觉：

**1. 滚动渐入 `.ready{opacity:0}` + `.fadeIn{animation;animation-fill-mode:backwards}` 模式（抄 about.vue）必须配 animationend 移除 .ready：**
```js
el.classList.add("fadeIn");
el.addEventListener("animationend", () => el.classList.remove("ready"), { once: true });
```
原因：`backwards` 只在动画开始前应用 0% 帧，播完后**不保持 100% 终态**，元素回到 `.ready{opacity:0}` 又变透明 → 整页内容不可见。移除 .ready 后该 opacity 规则不再生效，才稳定可见。reduced-motion 分支 `.ready{opacity:1}` 兜底（animation:none 不触发 animationend 也能可见）。

**2. 图表别用 SVG `<rect>`/`<text>` 动态绑 `:x`/`:y`/`:width`/`:height`：**
Vue hydration 时对这些属性走 DOM property 路径（`el.x = value`），而 SVGRectElement.x/y/width/height 是只读 getter、无 setter → 报 `Cannot set property x of #<SVGRectElement> which has only a getter`，刷屏数十条 warn + 中断 onMounted → observer 没建立 → .ready 永久 opacity:0 整页空白（症状"界面不显示"，但 SSR HTML 其实在、标题/SEO 正常）。
解法：柱状图/进度条改用 `<div>` + CSS（`height:%` 或 `width:var(--p)`），about.vue 的 MBTI 进度条即此范式；SVG 只用于静态属性。

**Why:** 两个坑都不抛 error（SVG 是 warn，动画坑完全静默），症状却都是"开 F12 看到一片空白"，容易误判为数据/路由问题。
**How to apply:** 新页面抄 about.vue 滚动渐入时务必带 animationend 回调移 ready；任何数据驱动图表首选 div+CSS，慎用 SVG 几何属性动态绑定。
