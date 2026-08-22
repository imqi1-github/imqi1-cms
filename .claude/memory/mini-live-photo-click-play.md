---
name: mini-live-photo-click-play
description: 小程序端实况照片(Motion Photo)点击播放的实现要点与平台约束
metadata: 
  node_type: memory
  type: project
  originSessionId: becbf62c-b832-4f3f-8eca-94da79ca62e2
---

mini/ 小程序端实况照片(正文 + 封面)实现为「点击播放」:静态图 <image> + 「实况」badge + ▶按钮,点击后拉整包二进制、扫 `ftyp` 切出内嵌 MP4、<video> 覆盖播放,播完回静态图。

**为何点击而非悬浮**:微信 <video> 是原生组件层级最高,做不了 web 那种图片上悬浮交叉淡入,故退化为点击覆盖播放。这是产品决策,不是没做完。

**关键文件**:
- `src/utils/live-photo.ts` — isLivePhoto/cleanLivePhotoUrl(`#live` 锚点判定/清理)、extractLivePhotoMedia(平台分流)、releaseLivePhotoVideo
- `src/components/live-photo/live-photo.vue` — 组件,props: src/alt/mode/fill(fill=true 封面占满父容器,false 正文 widthFix)/radius(圆角);emit load({width,height}) 供瀑布流分列
- `src/utils/markdown.ts` normalizeImage / `::: live-photo` 分支 — **保留 `#live` 并置 ImageBlock.isLive**(以前是剥掉标记当普通图);markdown-nodes.vue image + md-swiper 分支按 isLive/isLivePhoto 分流
- `src/pages/content/detail.vue` — 4 处封面(photo-hero swiper/单图 + header swiper/单图)按 isLivePhoto(url) 分流
- `src/components/waterfall-grid/waterfall-grid.vue` — 瀑布流实况图用 live-photo,@load 拿宽高比分列;外层 onCellTap 对实况 return(交组件自播,普通图才 previewImage)

**覆盖范围**:正文单图 + `::: live-photo` + 轮播图(swiper) + 瀑布流(waterfall) + 详情页封面,全部支持。

**平台约束/踩过的坑**:
1. 视频段生成:H5 用 Blob+createObjectURL;小程序用 getFileSystemManager().writeFile 写 USER_DATA_PATH 临时文件给 <video>(不能播 blob)。用 `let IS_H5` + 条件编译置真 + 运行时 if/else 分流,**不要**用双 return(vue-tsc 检查原始源码会报 no-unreachable)。
2. uni `<image>` 的 `@load` 事件:Vue 类型标成 DOM `Event`,handler 签名必须 `(e: Event)` 再 `as unknown as {detail}` 取宽高,否则 type-check 报 TS2345。
3. 图片/CDN 域名须加进小程序后台 request 合法域名白名单,否则 uni.request 取不到二进制。
4. 封面 url 的 `#live` 由 `server/api/attachments/upload.post.ts` 上传时注入（`fileUrl = \`${fileUrl}#live\``，约 :221）；mini 的 `server/api/mini/content/[id].get.ts` 经 `toAbsoluteUrl`（`new URL(url).href` 保留锚点）转绝对地址。
5. **原生 <video> 两个通病**(都因原生组件不由 WebView 渲染、层级最高、不受父级裁剪):
   - 点击后首帧解码前显示黑底 → 用 `poster=静态图` 消除黑屏闪烁。
   - 父级 `overflow:hidden`/`border-radius` 裁不了 video → 圆角必须直接加到 video 自身(radius prop)。
6. **交互**:点图片=previewImage 放大;点右下角 ▶按钮(`@tap.stop`)=播放。按钮不能加 pointer-events:none(否则点不动)。
7. **mp-weixin 两个真机崩点(仅小程序端暴露,H5/type-check 不报)**:
   - 组件自定义事件**不能用引用循环变量的内联箭头**绑定,如 `@load="(p)=>onLiveLoad(cell.index,p)"` 编译后 handler 变成字符串 "false",报 `does not have a method "false" to handle event`。解法:给组件加透传 `tag` prop,emit 时带回,父层 `@load="onLiveLoad"` 直接绑函数。
   - setup 同步执行 `cleanLivePhotoUrl(props.src)`,若 props.src 未就绪为 undefined 会 `Cannot read property 'replace' of undefined`。工具函数入参要 `string|undefined|null` 空值保护,组件内 imageSrc 用 computed 而非 setup 期 ref 定值。
8. **微信组件 wxss 选择器禁用**(控制台 warning,清理旧告警时踩到):组件 `.vue <style scoped>` 里**不能用含通配的后代选择器**(如 `.md-callout__body :first-child` 会编成 `* :first-child`)和**属性选择器**(如 `&[disabled]`)。解法:改用 BEM 修饰类(`&--disabled` + `:class` 绑定驱动)替代属性选;竖向间距靠父级 padding + 子块自身 margin,别用 `:first/last-child` 后代重置。另 `uni.getSystemInfoSync()` 已弃用 → 用 `uni.getWindowInfo()`。

验证:mini/ 下 `bun run type-check` + `bunx eslint` + `bun run build:mp-weixin` 均通过。
