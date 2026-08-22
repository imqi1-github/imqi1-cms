---
name: footer-music-architecture
description: "页脚音乐 FooterMusic.vue 不用 APlayer,走 useAudioPlayer composable(原生 new Audio detached 不入 DOM);md:hidden/max-md:hidden 双实例响应式;meting 后端 toHttps"
metadata: 
  node_type: memory
  type: project
  originSessionId: 3787c776-cd5a-4075-9d4a-2c8bc2bba7b4
---

页脚音乐架构(2026-07-23 Edge 实测确认):
- **FooterMusic.vue 不渲染 APlayer**。UI 是自定义 `<button v-if="isLoaded && currentSong">`(歌名 + 封面 `spin-slow` img + 进度条),逻辑全在 `app/composables/useAudioPlayer.ts`。
- **useAudioPlayer 用原生 `new Audio(song.url)`**,audio 是模块级单例且 **detached(不 appendChild 进 DOM)** → `document.querySelectorAll('audio')` 永远 0 是**正常的**,别误判成没初始化的 bug。
- **两套 FooterMusic 实例**响应式互斥:一个包在 `md:hidden`(移动端悬浮 `fixed bottom-8 right-8 z-9999`),一个包在 `max-md:hidden`(桌面端)。桌面视口下移动版 `display:none`、反之亦然;DOM 里同时有两个 button,共享同一 useAudioPlayer 单例(模块级 `isInitialized` 守卫保证 initPlayer 只跑一次)。
- 歌单走 `/api/meting?type=playlist&server&id`,每首 url/pic 是相对代理 `/api/meting?type=url|pic&id`,后端 `server/api/meting.ts` 302 重定向并 toHttps 升级(见 [[media-csp-https-only-firefox]])。实测 type=url→`https://m702.music.126.net/...mp3`、type=pic→`https://p3.music.126.net/...jpg`;Edge 下 https mp3 加载 `readyState=4`、`duration=30s` 正常。
- 失败计数 `meting_api_failure_count`(localStorage):歌单拉取失败 + 单首 error/stalled 共用同一计数,达 3 次 disablePlayer 隐藏胶囊、暂停 audio(刷新后自动重试,计数重置)。

**干扰项**:DOM 里若见到 `.aplayer-container`(list 显示 "A Bar Song (Tipsy)" 之类)那是首页/别处的独立 APlayer,与 FooterMusic 无关,排查页脚音乐时别跟它混。
