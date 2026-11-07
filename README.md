# ImQi1 CMS

[![license](https://img.shields.io/github/license/imqi1-github/imqi1-cms.svg?label=License&color=blue)](LICENSE)
[![Nuxt](https://img.shields.io/badge/Nuxt-4-00DC82?logo=nuxt&logoColor=white)](https://nuxt.com)
[![Prisma](https://img.shields.io/badge/Prisma-PostgreSQL-2d3748?logo=prisma&logoColor=white)](https://www.prisma.io)
[![bun](https://img.shields.io/badge/bun-1.4-f472b6?logo=bun&logoColor=white)](https://bun.sh)
[![uni-app](https://img.shields.io/badge/uni--app-H5%2FWeChat%2FAlipay-1685a5?logo=vuedotjs&logoColor=white)](mini)

预览：[https://imqi1.com](https://imqi1.com) · 文档：[https://docs.qi1.website](https://docs.qi1.website)

## 项目介绍

ImQi1 CMS 是基于 **Nuxt 4 + Prisma 7 + PostgreSQL + TailwindCSS** 的全栈个人博客与内容管理系统，也是 [imqi1.com](https://imqi1.com) 的完整源码。它不是通用型 CMS 模板，而是围绕「做技术的分享者、生活的摄影师、时事的评论员」打磨的一站式内容平台。仓库另含一个 **uni-app** 小程序子模块（`mini/`），一套代码编译到 H5 / 微信 / 支付宝三端。

- **内容创作**：Markdown 写作（Shiki 代码高亮、容器提示框、表情、图片灯箱、实况照片）、文章 / 独立页面 / 分类 / 标签 / 归档 / 更新日志 / 站内搜索
- **互动系统**：带审核状态的评论（图形验证码 + 百度内容安全审核）、留言板、友链申请与订阅
- **特色模块**：RSS 订阅聚合、旅行足迹地图与访客来源地图（高德）、附件管理（本地 / 腾讯云 COS）
- **管理后台**：`/admin` 下文章、分类、标签、评论、友链、订阅、旅行、用户、附件、缓存、站点设置全套管理

## 快速开始

环境要求：**Node.js ≥ 22.12**、**PostgreSQL ≥ 14**、**Bun ≥ 1.4**。

```bash
git clone --recurse-submodules https://github.com/imqi1-github/imqi1-cms.git
cd imqi1-cms
bun install              # 安装依赖（自动执行 nuxt prepare）
cp .env.example .env     # 至少填 DB_HOST / DB_PORT / DB_USER / DB_PASSWORD / DB_NAME
bun run prisma:generate  # 生成 Prisma Client
bun run db:init          # 建库（不存在时）+ 建表 + 写入默认设置 + 示例数据
bun run dev              # http://localhost:3000
```

- 克隆时漏了小程序子模块：`git submodule update --init --recursive`
- 默认管理员 `admin` / `123456`
- 生产环境部署见文档站：[快速部署](https://docs.qi1.website/quick-deploy) · [通过源码部署](https://docs.qi1.website/deployment/nodejs) · [Docker 部署](https://docs.qi1.website/deployment/docker)

## 参与贡献

欢迎提 Issue 或提交 PR，详见 [CONTRIBUTING.md](CONTRIBUTING.md) 与文档站 [参与贡献](https://docs.qi1.website/contributing)。提交前请跑通 `bun run check` 与 `bun run test`。

安全相关问题请按 [SECURITY.md](SECURITY.md) 私密报告，不要在公开 Issue 披露。

## License

[AGPL-3.0](LICENSE)

Copyright (C) 2026 棋 (Qi1) [https://github.com/imqi1-github](https://github.com/imqi1-github)
