# ImQi1 CMS

> 本 README 最后更新于 2026 年 7 月 4 日，对应的提交为 `91b792617d89fec0b903d53ae9df13ff5582690a`。

## 项目介绍

ImQi1 CMS 是一套基于 **Nuxt 4 + Prisma + TailwindCSS** 构建的全栈个人博客与内容管理系统，也是个人站点 [imqi1.com](https://imqi1.com) 的完整源码。它并非通用型 CMS 模板，而是围绕「做技术的分享者、生活的摄影师、时事的评论员」这一定位打磨的一站式内容平台，覆盖从内容创作、发布、管理到多端展示的完整链路。

项目采用 **SSR + ISR（增量静态再生成）** 架构：页面在服务端渲染以保证首屏与 SEO，同时借助 Redis（未配置时自动降级到文件系统）缓存渲染结果，兼顾性能与实时性。数据层使用 Prisma 7 搭配 MariaDB 适配器直连 MySQL/MariaDB，前后端类型则通过 Nuxt 的 `InternalApi` 自动推断，无需额外的类型生成器。

除了 Web 主站，仓库还以 Git 子模块的形式包含了一个基于 **uni-app** 的小程序端（`mini/`），支持 H5 / 微信小程序 / 支付宝小程序三端，并复用主站提供的专用 API。

主要能力包括：

- **内容创作**：完整的 Markdown 写作体验，代码高亮基于 Shiki，并支持容器提示框、表情、图片灯箱、实况照片（LivePhoto）等扩展语法与富媒体。
- **内容组织**：文章、独立页面、分类与标签（多态 meta）、文章归档、更新日志，以及站内搜索。
- **互动系统**：带审核状态的评论（含验证码、IP / UA 记录、百度内容安全审核）、留言板、友链申请与修改审核流程。
- **特色模块**：RSS 订阅源聚合、旅行足迹地图（高德地图）、访客 IP 地理分布、附件管理（本地 / 腾讯云 COS 双存储）。
- **管理后台**：`/admin` 下提供文章、分类、标签、评论、友链、订阅、旅行、用户、附件、站点设置等全套可视化管理。
- **工程与部署**：PWA 离线支持、CDN 静态资源分发与版本化、生产环境安全响应头（CSP / HSTS 等），并附带数据库初始化、资源上传、Nginx 配置生成等一系列运维脚本。

## 开发环境搭建

### 环境要求

- **Node.js** ≥ 20（推荐 LTS 版本）
- **MySQL** 或 **MariaDB**（用于存储站点数据）
- **Bun** ≥ 1.3（项目使用的包管理器与脚本运行器）
- **Redis**（可选，用于 ISR 缓存；未配置时自动降级到文件系统）

### 步骤

1. **安装 Node.js**

   前往 [nodejs.org](https://nodejs.org/) 下载并安装 LTS 版本，安装完成后确认：

   ```bash
   node -v
   ```

2. **安装 MySQL / MariaDB**

   安装数据库并创建一个供本项目使用的空数据库，例如 `imqi1`：

   ```sql
   CREATE DATABASE imqi1 DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
   ```

3. **安装 Bun**

   ```bash
   # macOS / Linux
   curl -fsSL https://bun.sh/install | bash

   # Windows (PowerShell)
   powershell -c "irm bun.sh/install.ps1 | iex"
   ```

   安装完成后确认：

   ```bash
   bun -v
   ```

4. **克隆仓库**

   项目包含 `mini/` 小程序子模块，克隆时建议一并拉取：

   ```bash
   git clone --recurse-submodules https://gitee.com/imqi1-gitee/imqi1-cms.git
   cd imqi1-cms
   ```

   若克隆时遗漏了子模块，可补充执行：

   ```bash
   git submodule update --init --recursive
   ```

5. **安装依赖**

   ```bash
   bun install
   ```

6. **配置环境变量**

   复制示例文件并按实际情况填写数据库连接、Redis、CDN 等配置：

   ```bash
   cp .env.example .env
   ```

   至少需要配置数据库相关变量（`DATABASE_URL` 供 Prisma 使用，`DB_HOST` / `DB_PORT` / `DB_USER` / `DB_PASSWORD` / `DB_NAME` 供应用运行时的 MariaDB 适配器使用）。

7. **生成 Prisma Client**

   ```bash
   bun prisma generate
   ```

8. **初始化数据库**

   执行初始化脚本，一步完成建表、写入站点默认设置并插入示例数据：

   ```bash
   bun run db:init
   ```

   该命令会读取 `.env` 中的数据库配置并执行 `scripts/init-db.sql`，创建全部 15 张数据表、写入所有站点设置项的默认值，并插入一份示例数据（1 个管理员、1 个分类、1 篇文章、1 条评论）。脚本是幂等的，可安全重复执行，不会产生重复数据，也不会覆盖你已修改过的内容。

   初始化后即可使用默认管理员账户登录后台：

   | 项目 | 默认值 |
   | --- | --- |
   | 用户名 | `admin` |
   | 密码 | `123456` |
   | 邮箱 | `example@example.com` |

   > ⚠️ 出于安全考虑，登录后请立即在后台「账户设置」中修改密码。
   >
   > 生产环境也可跳过此命令，直接在数据库管理工具（phpMyAdmin / Navicat / mysql cli 等）中导入 `scripts/init-db.sql` 执行，效果完全一致。

9. **启动开发服务器**

   ```bash
   bun run dev
   ```

   默认访问地址为 [http://localhost:3000](http://localhost:3000)，管理后台位于 `/admin`。

## 使用 - 开发环境

