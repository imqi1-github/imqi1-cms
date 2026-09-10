---
name: livephoto-video-blob-cache
description: "实况照片视频 Blob URL 走 useLivePhoto 模块级会话缓存（按原图 URL 索引），跨 LivePhoto 实例共享；缓存独占所有权、组件永不 revoke；路由切换时 clearLivePhotoVideoCache() 统一释放；首次切换卡顿=冷路径三次整段拷贝，已改 res.blob()+blob.slice 惰性零拷贝 + indexOf 扫 ftyp + 灯箱 rIC 预热相邻两张"
metadata:
  type: project
---

实况照片（JPEG + 尾部内嵌 MP4）的视频提取结果在 app 侧走**一份全局缓存**，而不是每个 `<LivePhoto>` 各提各的。2026-09 灯箱切图卡顿整治时定下。

**为什么**：文章页的 `LivePhoto` 早就把视频提好了，点开灯箱却起一份新实例重提同一份字节（fetch 整张图 + 扫 ftyp 切片 + 建 Blob）；灯箱内切上一张/下一张同理。同一 src 复用一份结果即可。

**设计（`app/composables/useLivePhoto.ts`）**
- 模块级 `videoUrlCache: Map<原图URL, blobUrl | null>`（`null` = 已确认无内嵌 MP4，记一笔避免反复重提）+ `inflight: Map<url, Promise>` 做并发去重（同 src 只 fetch 一次）
- `extractLivePhotoMedia(url)` 只返回 `{ videoUrl }` —— 原来还返回 `imageUrl`，但 `LivePhoto` 的 `<img>` 用的是原 URL（`cleanSrc`），那份 image blob **从没被读过**，纯属白复制一整包 buffer，已删
- **不接受 AbortSignal**：同 src 的请求是共享的，一个调用方 abort 会连带掐掉别人；且缓存语义与取消冲突。调用方 await 后按自己的状态判断结果还要不要，请求让它跑完入缓存
- **缓存独占所有权**：组件只引用、**永不 revoke**（可能有别的实例指着同一个 URL）。`clearLivePhotoVideoCache()` 在**路由切换**时统一释放——挂在 `Lightbox.vue` 里（它是 app.vue 挂载一次的全局单例，天然的应用级钩子）。别改成「关灯箱时清」：文章页的 LivePhoto 还在用那些 URL

**Lightbox 侧配合（`app/components/Lightbox.vue`）**
- `.lb-media` 与 `<LivePhoto>` **不挂 `:key`**，让 Vue 按位置/类型复用实例——切图省掉 setup 重跑、refs 重置、IntersectionObserver 重绑。`<img v-else>` 保留 `:key`（与 LivePhoto 是不同 v-if 分支，需靠 key 区分）
- `LivePhoto` 的 watch 里**先提取、后赋值**，不清空 `videoBlobUrl` 再赋新值——`<video>` 的 `v-if` 全程为真、只换 `src` 属性，避免「先卸载（黑帧）→ 再挂载」的闪烁

**首次切换卡顿（2026-09-10 修）**：症状是「第一次切到某张卡、循环回来就顺」——卡的是缓存未命中时的整包提取，不是 `<video>` 解码（解码每次切都重来，循环回来照样要解）。两处：

- **拷贝次数**（主因）：原 `res.arrayBuffer()` → `bytes.slice(start)` → `new Blob([...])` 是**三次整段拷贝**，实况照上传上限 50MB，主线程得扛上百 MB memcpy。现改 `res.blob()`（浏览器托管）→ 仅为扫 ftyp 做一次 `blob.arrayBuffer()` → `createObjectURL(blob.slice(start, blob.size, "video/mp4"))`（**Blob.slice 是惰性视图、零拷贝**），只剩一次。
- **扫 ftyp**：逐字节循环扫几十 MB 太慢，改 `bytes.indexOf(0x66, 4)` 粗筛 `'f'` 再校验后三字节 + 前置 box size ≥ 8。与原循环语义等价——越界位置读出来是 `undefined`，比较自然不成立，不必额外判界。
- **预热**：灯箱里原有的 `<img class="lb-preload">`（`preload` computed）只预热了 HTTP 缓存，视频段仍要等切过去才提。现 `Lightbox.vue` watch 这个 `preload`，对相邻的 `isLive` 张调 `extractLivePhotoMedia(s.cleanSrc)`——key 必须用 `slide.cleanSrc`（去掉 `#live`），与 LivePhoto 内部 `cleanLivePhotoUrl(props.src)` 对齐。放 `requestIdleCallback(warm, {timeout: 1000})`（回退 `setTimeout 200`）里跑，不跟开合 morph / 交叉淡化抢主线程；`immediate: true` 在 SSR 也会触发，故首行 `if (!import.meta.client) return` 必须留着。

**仍在但已无用**：`AbortController`/`extractAbortController` 在这一版被整个删掉了；`extractMotionVideo`（全仓无人调用）也删了。

相关：[[livephoto-firefox-hevc-degrade]] [[image-lightbox-top-layer-dialog]] [[mini-live-photo-click-play]]
