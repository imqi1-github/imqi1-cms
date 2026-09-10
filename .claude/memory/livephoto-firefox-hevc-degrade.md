---
name: livephoto-firefox-hevc-degrade
description: "线上实况照片多为 single ftyp + HEVC,Firefox 不解 → video @error 降级静态图(已生效);双 MP4 仅原始一加照片有,compress 后转 single H.264"
metadata: 
  node_type: memory
  type: project
  originSessionId: 13db999b-9a0e-4c7b-9958-3dface3e0af7
---

实测扫描(.attachments + .live-photos 共 16 张)结论:

- **普遍情况(主因)**:线上 .attachments 的实况照片大多是 **single ftyp + HEVC(hvc1)**,Firefox 默认不解 → metadata error。这才是 Firefox 报错的主体。切片逻辑对 single ftyp 无问题。多为微信导出(mmexport*)等只保留主视频段的来源。
- **特例(双 MP4)**:仅原始未压缩的一加照片 `.live-photos/微信图片_20260617205300_8_4.jpg`(9.1MB,OnePlus Ace 5 Ultra 直拍)有 **2 个 ftyp**——安卓 Motion Photo 规范:JPEG 嵌预览(MotionPhotoPreview)+ 主(MotionPhoto)两段 MP4,中间夹 185KB 设备元数据(含机型串),尾部有 JSON 索引 `[{"length":..}]`。findMotionVideoStart 找第一个 ftyp 切到文件尾会产出"预览+元数据+主+JSON"非法 blob。
- **compress 后**:同名文件在 .attachments 为 0.5MB **single + AVC/H.264**(compress-livephoto.mjs 产物),Firefox 能播。但用户多数照片没过 H.264 转码,仍是 HEVC。

**修复(前端降级,已生效):** LivePhoto.vue `onVideoError` 监听 video `@error`,失败清 videoBlobUrl/移除 DOM 退化为静态图。@error 不挑根因,HEVC 或切片错都兜底。用户 2026-07-23 确认接受 Firefox 全部降级、不要转码。

> 2026-09-10 起灯箱已换自研 `<Lightbox>`,灯箱内直接渲染 `LivePhoto.vue`,原先 `useFancyboxLivePhoto.ts` 那份重复的 `handleVideoError` 已随 Fancybox 一并删除——降级逻辑现在**只有 LivePhoto.vue 一处**,见 [[image-lightbox-top-layer-dialog]]。

**2026-07-23 Firefox 152 实测确认降级生效**(playwright-firefox):navigate 后 `document.querySelectorAll('video')=0`(video 全移除),console 仅 warning(`NS_ERROR_DOM_MEDIA_NOT_SUPPORTED_ERR (0x806e0003) ... Utility MF Media Engine CDM only support for media engine playback` + `[LivePhoto] 视频解码失败，已退化为静态图` @ LivePhoto.vue:316),**0 error**——降级 graceful,静态图正常。对照同站 Edge 150 下该页 video `readyState=4`、duration 正常、play() 成功。

**How to apply:** Firefox 全部退化已生效。若将来要 Firefox/Chrome 都能播:① 批量 HEVC→H.264(compress-livephoto.mjs 接入上传);② ⚠️ compress 脚本也用 findMp4Start 找第一个 ftyp,对**双 MP4 原始文件会切错**(只转出 preview 段),对单 MP4 文件无此问题。相关:[[mini-live-photo-click-play]] [[media-csp-https-only-firefox]]
