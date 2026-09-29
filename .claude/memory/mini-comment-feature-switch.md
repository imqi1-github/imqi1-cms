---
name: mini-comment-feature-switch
description: 小程序评论由 site.config.ts 的 features.miniComment 独立控制，不跟随主站后台 commentEnabled
metadata:
  node_type: memory
  type: project
---
小程序评论开关是构建期配置 `site.config.ts` 的 `features.miniComment`，默认值为 `true`。它与后台 `informations.commentEnabled` 是两个独立开关：后者只控制主站评论区，前者控制 `/api/mini/comments` 和 `/api/mini/messages-config` 的小程序评论、留言展示与写入。

`features.miniComment=false` 时，`server/api/mini/comments.get.ts` 返回空列表和 `commentEnabled:false`，`server/api/mini/comments.post.ts` 返回 403，`server/api/mini/messages-config.get.ts` 返回 `commentEnabled:false`，小程序应隐藏评论和留言入口。

修改 `site.config.ts` 后必须重新构建主站。`miniApi` 是另一项开关，只控制 `/api/mini/**` 是否参与 Nitro 构建，不等同于评论开关。
