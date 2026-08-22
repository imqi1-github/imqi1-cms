---
name: qqmusic-personal-data-unreachable
description: "QQ音乐\"我的听歌数据\"无合规API;听歌排行/播放历史被锁App端,官方与主流逆向项目都拿不到"
metadata: 
  node_type: memory
  type: reference
  originSessionId: 5684f2ea-3dd0-4ad7-8874-dadcfb9c8eba
---

用户计划做"个人动态页"(运动/音乐/视频/消费),其中音乐用 QQ音乐。调研结论(2026-07-25):**QQ音乐"我的听歌排行/播放历史/听歌时长"无法通过合规或稳定途径获取**。

**三条证据:**
1. 官方开放平台 `developer.y.qq.com` 只开播放能力/曲库资源(TME Connect/SDK/车机),无个人听歌接口;年度报告页 `y.qq.com/m/year_personal_xxxx` 明确写"涉及个人听歌数据,仅限客户端查看"。对比网易云 OpenAPI 有 `获取听歌排行` 接口,QQ刻意没开。
2. 主流逆向项目 `jsososo/QQMusicApi`(读 routes/user.js + recommend.js 全源码)带 cookie 后只能拿:`/user/songlist`(我创建的歌单含"我喜欢")、`/user/collect/*`(收藏歌单/专辑)、`/user/follow/*`、`/fans`、`/recommend/daily`(日推=推荐非历史);**无"我的听歌排行/最近播放"接口**,issue #167 Closed 未实现。Rain120 koa2 版同理。
3. 听歌排行走 App 专属鉴权(非 Web c.y.qq.com/u.y.qq.com 批次),Web 逆向够不到。

**理论"重武器":** App 抓包(CAH+Frida 绕 SSL pinning+破 sign),工程量周计、cookie 频过期、随版本失效、合规风险——只宜自玩,不可上对外站点。

**可落地方案(按推荐序):**
- `/user/songlist` 逆向+个人cookie:展示"我的歌单/我喜欢"(非听歌排行,是收藏);接受 cookie 过期维护成本。
- Last.fm scrobble 中转:官方API拉最近播放/排行,但 QQ音乐客户端无原生 scrobble,要桌面端挂插件。
- 手动录录入 admin 后台:最稳。

相关:[[personal-dashboard-no-public-api]](四平台均无个人数据公开API的总调研,待建)。
