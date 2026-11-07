---
name: mini-page-title-bar-padding
description: 小程序列表/聚合页 .title-bar 左右 padding 统一 24rpx;卡片式头部(messages intro / content detail header)自成 40rpx 体系不纳入
metadata: 
  node_type: memory
  type: project
  originSessionId: 04086897-cc56-47da-ab84-7d23432eda0c
---

小程序"裸大字标题"页(归档/分类列表/分类详情/关于/足迹/更新日志/友链)顶部的 `.title-bar` 左右 padding 统一为 **24rpx**(`padding: 40rpx 24rpx 8rpx;`,top 40 / bottom 8)。新增列表/聚合页照此,别再写成 40rpx——category/detail 与 link 曾误写成 `40rpx 40rpx 8rpx` 致与基准页左对齐不一致,已修(2026-07-28)。

基准页(均已 24rpx):archive / category/index / about / travel / changelog。

另两类头部是**不同设计语言**,不纳入此统一,保持各自 40rpx:
- 留言板 `messages/index.vue` 的 `.intro`(带描述 + `background: var(--card)` + `border-bottom` 的卡片式头部);
- 文章详情 `content/detail.vue` 的 `.header`(同样卡片式,且 `.photo-meta` / `.photo-hero__caption` / 正文 `.content` 均为 40rpx 联动的通栏阅读体系,单改 header 会让标题凸出正文,要统一须 header + 正文一起动)。

首页 index 是 hero,特殊布局,不涉及。
