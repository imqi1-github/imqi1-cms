---
name: media-csp-https-only-firefox
description: "CSP media-src/img-src 故意不含 http:,第三方媒体/图片直链返回 http 时 Firefox 会被 CSP+混合内容双重拦截,后端代理重定向必须 toHttps 升级"
metadata: 
  node_type: memory
  type: project
  originSessionId: 13db999b-9a0e-4c7b-9958-3dface3e0af7
---

buildCsp()（server/utils/csp.ts）的 media-src/img-src 故意只放 https（注释:去掉 http: 避免混合内容）。但网易云等音乐 CDN 经 `/api/meting?type=url|pic` 走 sendRedirect 返回的直链常是 `http://m701.music.126.net/...`。

**关键差异**:Chrome 对 http 媒体静默升级放行,Firefox 不升级、严格按 CSP media-src 拦截 → 一连串"歌曲加载失败" → useAudioPlayer 连续失败 3 次 → disablePlayer 停用整个页脚音乐（用户报的就是这个,2026-07-23）。

**修复**:server/api/meting.ts 加 `toHttps(url)`,url/pic 两个 case 的 sendRedirect 目标统一 http→https（126.net 等节点同时支持 https）。Chrome 下 no-op,Firefox 下放行。

**How to apply**:后续任何第三方媒体/图片直链走后端代理重定向的,都要 toHttps;遇"Firefox 媒体加载失败 + Chrome 正常"先查 CSP media-src 是否漏了源/是否 http 被拦。个别歌曲 url 返回空（版权/VIP）会被 validateRedirectUrl 拦成 400,属源头问题非 bug,代码已切下一首。相关:[[public-api-explicit-field-whitelist]]
