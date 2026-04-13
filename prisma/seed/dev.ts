import { PrismaClient } from "@prisma/client";
import { PrismaMariaDb } from "@prisma/adapter-mariadb";
import * as bcrypt from "bcryptjs";

const adapter = new PrismaMariaDb({
  host: process.env.DB_HOST || "localhost",
  port: Number(process.env.DB_PORT || 3306),
  user: process.env.DB_USER || "root",
  password: process.env.DB_PASSWORD!,
  database: process.env.DB_NAME!,
  connectionLimit: 10,
});

const prisma = new PrismaClient({
  adapter,
});

// 示例文章内容
const samplePosts = [
  {
    title: "欢迎使用新的博客系统",
    content: `# 欢迎使用新的博客系统

这是一个基于 Nuxt 4 和 Prisma 构建的现代化博客系统。

## 主要特性

- 📝 响应式设计
- 🎨 使用 shadcn-nuxt 组件库
- 💾 MySQL 数据库
- 🔐 完整的用户认证系统

希望你喜欢这个系统！`,
    desc: "欢迎来到我们的新博客，这里有一些你需要知道的事情。",
    slug: "1",
  },
  {
    title: "TypeScript 最佳实践指南",
    content: `# TypeScript 最佳实践指南

TypeScript 为 JavaScript 添加了类型系统，让代码更加健壮。

## 1. 类型注解

\`\`\`typescript
interface User {
  id: number
  name: string
  email: string
}
\`\`\`

## 2. 使用泛型

泛型可以帮助我们创建可复用的组件。`,
    desc: "分享一些 TypeScript 开发中的最佳实践和技巧。",
    slug: "2",
  },
  {
    title: "Vue 3 Composition API 详解",
    content: `# Vue 3 Composition API 详解

Vue 3 引入了 Composition API，让我们可以更好地组织代码逻辑。

## setup 函数

setup 函数是 Composition API 的入口点。

## ref 和 reactive

ref 和 reactive 是创建响应式数据的两种方式。`,
    desc: "深入理解 Vue 3 Composition API 的工作原理和使用方法。",
    slug: "3",
  },
  {
    title: "Nuxt 4 新特性介绍",
    content: `# Nuxt 4 新特性介绍

Nuxt 4 带来了许多令人兴奋的新特性。

## 更快的构建速度

使用 Vite 作为默认构建工具，开发体验更佳。

## 更好的 TypeScript 支持

开箱即用的 TypeScript 支持，无需额外配置。`,
    desc: "探索 Nuxt 4 框架的最新功能和改进。",
    slug: "4",
  },
  {
    title: "MySQL 性能优化技巧",
    content: `# MySQL 性能优化技巧

MySQL 是一个流行的开源关系数据库。

## 索引优化

合理使用索引可以大幅提升查询性能。

## 查询优化

使用 EXPLAIN 分析查询计划。

## 配置优化

调整 my.cnf 配置文件以提升性能。`,
    desc: "一些实用的 MySQL 数据库优化建议。",
    slug: "5",
  },
  {
    title: "前端开发工具推荐",
    content: `# 前端开发工具推荐

工欲善其事，必先利其器。

## VS Code

强大的代码编辑器，配合各种插件效果更佳。

## Chrome DevTools

前端调试的必备工具。`,
    desc: "分享一些提高开发效率的工具和插件。",
    slug: "6",
  },
  {
    title: "CSS Grid 布局完全指南",
    content: `# CSS Grid 布局完全指南

CSS Grid 是一个强大的二维布局系统。

## 基本概念

- Grid Container
- Grid Item
- Grid Line
- Grid Track

## 实战案例

通过实际案例学习 Grid 布局。`,
    desc: "从零开始学习 CSS Grid 网格布局。",
    slug: "7",
  },
  {
    title: "RESTful API 设计规范",
    content: `# RESTful API 设计规范

良好的 API 设计是后端开发的基础。

## URL 设计

使用名词而非动词，使用复数形式。

## HTTP 方法

GET、POST、PUT、DELETE 的正确使用。`,
    desc: "如何设计优雅且易用的 RESTful API。",
    slug: "8",
  },
  {
    title: "Git 工作流最佳实践",
    content: `# Git 工作流最佳实践

掌握 Git 是每个开发者的必备技能。

## 分支管理

- main: 主分支
- develop: 开发分支
- feature: 功能分支

## 提交信息

使用清晰的提交信息，遵循 Conventional Commits 规范。`,
    desc: "高效使用 Git 进行版本控制和团队协作。",
    slug: "9",
  },
  {
    title: "Docker 容器化入门",
    content: `# Docker 容器化入门

Docker 让应用部署变得简单。

## Dockerfile

编写 Dockerfile 来定义应用镜像。

## Docker Compose

使用 Docker Compose 管理多容器应用。`,
    desc: "学习如何使用 Docker 容器化你的应用。",
    slug: "10",
  },
  {
    title: "Web 性能优化实战",
    content: `# Web 性能优化实战

性能优化是前端开发的重要课题。

## 资源加载优化

- 代码分割
- 懒加载
- 预加载

## 渲染优化

- 减少 DOM 操作
- 使用虚拟滚动
- 防抖和节流`,
    desc: "提升网页加载速度和用户体验的实用技巧。",
    slug: "11",
  },
  {
    title: "React Hooks 深入解析",
    content: `# React Hooks 深入解析

Hooks 改变了我们编写 React 组件的方式。

## useState

管理组件状态。

## useEffect

处理副作用。

## 自定义 Hooks

复用逻辑的最佳方式。`,
    desc: "深入理解 React Hooks 的工作原理和最佳实践。",
    slug: "12",
  },
  {
    title: "Node.js 异步编程",
    content: `# Node.js 异步编程

Node.js 的异步特性是其核心优势。

## 回调函数

最基础的异步处理方式。

## Promise

Promise 让异步代码更易读。

## async/await

同步风格的异步代码写法。`,
    desc: "掌握 Node.js 中的异步编程模式。",
    slug: "13",
  },
  {
    title: "Tailwind CSS 实战教程",
    content: `# Tailwind CSS 实战教程

Tailwind CSS 是一个实用优先的 CSS 框架。

## 基础概念

- 工具类
- 响应式设计
- 深色模式

## 自定义配置

通过 tailwind.config.js 自定义主题。`,
    desc: "从零开始学习 Tailwind CSS 框架。",
    slug: "14",
  },
  {
    title: "微前端架构实践",
    content: `# 微前端架构实践

微前端让大型应用开发更加灵活。

## qiankun

基于 single-spa 的微前端框架。

## 模块联邦

Webpack 5 的模块联邦功能。`,
    desc: "探讨微前端架构的设计理念和实现方案。",
    slug: "15",
  },
  {
    title: "Markdown 语法完全指南",
    content: `# Markdown 语法完全指南

这是一份完整的 Markdown 语法参考文档，涵盖了所有常用的语法特性。

## 1. 标题

Markdown 支持两种标题语法：

### ATX 标题（使用 \#）

\# 一级标题
\## 二级标题
\### 三级标题
\#### 四级标题
\##### 五级标题
###### 六级标题

### Setext 标题（使用 = 和 -）

一级标题
=========

二级标题
---------

## 2. 文本样式

- **粗体文本**：使用 \`**文本**\` 或 \`__文本__\`
- *斜体文本*：使用 \`*文本*\` 或 \`_文本_\`
- ***粗斜体***：使用 \`***文本***\` 或 \`___文本___\`
- ~~删除线~~：使用 \`~~文本~~\`
- ==高亮==：使用 \`==文本==\`（部分支持）
- 下标：H~2~O
- 上标：X^2^

## 3. 列表

### 无序列表

使用 \`*\`、\`+\` 或 \`-\`：

* 第一项
* 第二项
  * 嵌套项 1
  * 嵌套项 2
* 第三项

### 有序列表

使用数字加点：

1. 第一项
2. 第二项
   1. 嵌套项 1
   2. 嵌套项 2
3. 第三项

### 定义列表

术语 1
:   定义 1

术语 2
:   定义 2
:   定义 2 的扩展

## 4. 链接

### 行内链接

[链接文本](https://example.com)

[带标题的链接](https://example.com "鼠标悬停显示")

### 相对路径链接

[关于页面](/about)

### 引用链接

[引用链接][id1]

[id1]: https://example.com "引用链接提示"

### URL 链接

<https://example.com>
<email@example.com>

## 5. 图片

### 行内图片

![替代文本](https://via.placeholder.com/150)

### 带标题的图片

![替代文本](https://via.placeholder.com/150 "图片标题")

### 引用方式图片

![引用图片][img-id]

[img-id]: https://via.placeholder.com/150 "引用图片"

## 6. 代码

### 行内代码

使用反引号 \`\` 包裹代码：\`const x = 1;\`

### 代码块

使用三个反引号包裹：

\`\`\`javascript
function hello() {
  console.log("Hello, World!");
}
\`\`\`

### 缩进代码块（4个空格或1个Tab）

    function hello() {
      console.log("Hello, World!");
    }

### 语法高亮

\`\`\`python
def hello():
    print("Hello, Python!")
\`\`\`

\`\`\`bash
echo "Hello, Bash!"
\`\`\`

## 7. 引用

### 基本引用

> 这是一段引用文本

### 嵌套引用

> 外层引用
>
> > 内层引用
>
> 外层引用继续

### 引用其他元素

> ## 标题
>
> 1. 列表项 1
> 2. 列表项 2
>
> > 嵌套引用

## 8. 表格

### 对齐方式

| 左对齐 | 居中对齐 | 右对齐 |
|:-------|:-------:|-------:|
| 内容 1 | 内容 2  | 内容 3 |
| 长 1   | 长 2    | 长 3   |

### 简化表格

| 标题 1 | 标题 2 |
| ------ | ------ |
| 内容   | 内容   |

## 9. 分隔线

使用三个或更多的 \`*\`、\`-\` 或 \`_\`：

***

---

___

* * *

## 10. 任务列表

- [x] 已完成的任务
- [ ] 未完成的任务
- [ ] 待办事项 1
- [x] 已完成事项

## 11. 转义字符

使用反斜杠 \`\\\` 转义特殊字符：

\\\\   反斜杠
\`   反引号
*   星号
_   下划线
{}  大括号
[]  中括号
()  小括号
#   井号
+   加号
-   减号
.   点号
!   感叹号

## 12. HTML 支持

Markdown 支持嵌入 HTML：

<div style="color: red;">
  这是红色文字
</div>

<table>
  <tr>
    <td>HTML 表格</td>
  </tr>
</table>

## 13. 脚注

这是一段文字[^1]，包含脚注引用。

[^1]: 这是脚注内容

[^2]: 这是另一个脚注，可以包含**格式化**文本。

## 14. 数学公式（部分支持）

行内公式：$E = mc^2$

块级公式：

$$
\\\\sum_{i=1}^{n} i = \\\\frac{n(n+1)}{2}
$$

## 15. Emoji

使用 :emoji-name: 格式：

:smile: :heart: :thumbsup: :fire: :star:

## 16. 快捷提示

### 键盘快捷键

<kbd>Ctrl</kbd> + <kbd>C</kbd>

<kbd>Cmd</kbd> + <kbd>V</kbd>

### 高亮/标记

==重要内容==需要特别注意

## 17. 折叠细节

<details>
<summary>点击展开查看更多</summary>

这是隐藏的内容，点击标题后才会显示。

可以包含多行内容和各种 Markdown 格式。
</details>

## 18. 缩写

*[HTML]: HyperText Markup Language
*[CSS]: Cascading Style Sheets

使用 HTML 和 CSS 构建网页。

## 19. 自动链接

https://www.example.com 会自动转换为链接。

## 20. 混合使用示例

> **提示**：你可以组合使用各种语法！
>
> - 列表项中的 **粗体** 和 *斜体*
> - 列表中的 \`代码\`
> - 列表中的 [链接](https://example.com)
> - 列表中的图片：![示例](https://via.placeholder.com/30)

---

**恭喜！** 你已经掌握了 Markdown 的全部语法 🎉`,
    desc: "完整的 Markdown 语法参考手册，涵盖所有常用和高级语法特性。",
    slug: "16",
  },
  {
    title: "WebSocket 实时通信实战",
    content: `# WebSocket 实时通信实战

WebSocket 提供了全双工通信通道。

## 连接建立

\`\`\`javascript
const ws = new WebSocket('ws://localhost:8080');
ws.onopen = () => console.log('Connected');
\`\`\`

## 消息收发

发送和接收消息的示例。`,
    desc: "学习如何使用 WebSocket 实现实时通信功能。",
    slug: "17",
  },
  {
    title: "CSS 动画入门教程",
    content: `# CSS 动画入门教程

CSS 动画让网页更加生动。

## @keyframes

定义动画的关键帧。

## transition

平滑过渡效果。

## animation

综合动画属性。`,
    desc: "从零开始学习 CSS 动画的制作。",
    slug: "18",
  },
  {
    title: "JavaScript 闭包详解",
    content: `# JavaScript 闭包详解

闭包是 JavaScript 中的重要概念。

## 什么是闭包

闭包是指有权访问另一个函数作用域中变量的函数。

## 闭包的应用

- 数据私有化
- 函数柯里化
- 模块模式`,
    desc: "深入理解 JavaScript 闭包的工作原理。",
    slug: "19",
  },
  {
    title: "Webpack 配置指南",
    content: `# Webpack 配置指南

Webpack 是强大的模块打包工具。

## 基本配置

entry、output、loader 的配置。

## 优化技巧

代码分割、tree shaking、压缩优化。`,
    desc: "掌握 Webpack 的配置和优化技巧。",
    slug: "20",
  },
  {
    title: "HTTP 缓存策略",
    content: `# HTTP 缓存策略

合理的缓存策略可以提升性能。

## 强缓存

Cache-Control 和 Expires。

## 协商缓存

ETag 和 Last-Modified。`,
    desc: "理解 HTTP 缓存机制，优化网页加载速度。",
    slug: "21",
  },
  {
    title: "Vue 组件通信方式",
    content: `# Vue 组件通信方式

组件间通信是 Vue 开发的核心。

## props 和 emit

父子组件通信。

## provide 和 inject

跨层级组件通信。

## 事件总线

任意组件间通信。`,
    desc: "总结 Vue 中各种组件通信的方式和适用场景。",
    slug: "22",
  },
  {
    title: "CSS 预处理器对比",
    content: `# CSS 预处理器对比

Sass、Less、Stylus 各有特点。

## Sass

功能最强大，成熟稳定。

## Less

学习曲线平缓，易于上手。

## Stylus

语法简洁灵活。`,
    desc: "对比主流 CSS 预处理器的优缺点。",
    slug: "23",
  },
  {
    title: "前端安全防护",
    content: `# 前端安全防护

Web 安全至关重要。

## XSS 防护

输入过滤、输出编码。

## CSRF 防护

Token 验证、SameSite 属性。

## CSP

内容安全策略。`,
    desc: "了解常见的前端安全漏洞及防护措施。",
    slug: "24",
  },
  {
    title: "移动端适配方案",
    content: `# 移动端适配方案

移动端适配是响应式设计的关键。

## rem 方案

根据根元素字体大小计算。

## vw/vh 方案

视口单位相对布局。

## 媒体查询

不同屏幕不同样式。`,
    desc: "介绍几种主流的移动端适配方案。",
    slug: "25",
  },
  {
    title: "JavaScript 异步处理",
    content: `# JavaScript 异步处理

掌握异步编程是必备技能。

## Promise

异步操作的容器。

## async/await

同步风格的异步代码。

## 事件循环

理解 JavaScript 执行机制。`,
    desc: "深入理解 JavaScript 的异步编程模式。",
    slug: "26",
  },
  {
    title: "Git 常用命令总结",
    content: `# Git 常用命令总结

Git 是版本控制的标准工具。

## 分支操作

branch、checkout、merge。

## 提交操作

add、commit、push、pull。

## 撤销操作

reset、revert、checkout。`,
    desc: "整理 Git 开发中常用的命令。",
    slug: "27",
  },
  {
    title: "CSS BEM 命名规范",
    content: `# CSS BEM 命名规范

BEM 是一种实用的 CSS 命名方法论。

## 命名规则

Block、Element、Modifier。

## 示例

\`\`\`css
.block { }
.block__element { }
.block--modifier { }
\`\`\`

## 优势

提高代码可读性和可维护性。`,
    desc: "学习 BEM 命名规范，写出更清晰的 CSS。",
    slug: "28",
  },
  {
    title: "正则表达式入门",
    content: `# 正则表达式入门

正则表达式是强大的文本处理工具。

## 基本语法

- 字符类
- 量词
- 边界
- 分组

## 常用模式

邮箱、手机号、URL 等验证。`,
    desc: "掌握正则表达式的基本语法和常用模式。",
    slug: "29",
  },
  {
    title: "前端性能监控",
    content: `# 前端性能监控

性能监控是优化的重要依据。

## 核心指标

FCP、LCP、CLS、FID。

## 监控工具

Lighthouse、Web Vitals。

## 优化建议

基于监控数据进行针对性优化。`,
    desc: "了解前端性能监控的指标和工具。",
    slug: "30",
  },
];

// 示例评论内容
const sampleComments = [
  "这篇文章写得真好，学到了很多！",
  "感谢分享，非常有用。",
  "有一个小问题，能详细解释一下吗？",
  "已经收藏了，以后慢慢看。",
  "期待下一篇更新！",
  "这个观点很新颖，值得深思。",
  "代码示例很清晰，感谢作者。",
  "请问有相关的学习资源推荐吗？",
  "博主回复好及时，点赞！",
  "这篇文章解决了我困扰很久的问题。",
  "写得非常详细，给新手很友好。",
  "希望多出一些这样的教程。",
  "已转发给同事，大家一起学习。",
  "博主太厉害了，向你学习！",
  "请问这个问题有其他解决方案吗？",
];

// 示例分类（4个大类）
const categories = [
  { name: "小记", slug: "note", desc: "记录生活中的点点滴滴", type: "category" },
  { name: "摄影", slug: "shot", desc: "用镜头记录生活中的美好瞬间", type: "category" },
  { name: "技术", slug: "tech", desc: "分享编程技术和开发经验", type: "category" },
  { name: "讨论", slug: "discussion", desc: "对时事和观点的讨论与思考", type: "category" },
];

// 示例标签（10个标签，作为小类）
const tags = [
  { name: "Vue", slug: "vue", desc: "Vue.js 框架相关", type: "tag" },
  { name: "React", slug: "react", desc: "React 框架相关", type: "tag" },
  { name: "TypeScript", slug: "typescript", desc: "TypeScript 语言相关", type: "tag" },
  { name: "CSS", slug: "css", desc: "CSS 样式相关", type: "tag" },
  { name: "JavaScript", slug: "javascript", desc: "JavaScript 语言相关", type: "tag" },
  { name: "Node.js", slug: "nodejs", desc: "Node.js 后端开发", type: "tag" },
  { name: "数据库", slug: "database", desc: "数据库相关技术", type: "tag" },
  { name: "工具", slug: "tools", desc: "开发工具推荐", type: "tag" },
  { name: "性能优化", slug: "performance", desc: "性能优化技巧", type: "tag" },
  { name: "学习笔记", slug: "learning", desc: "学习过程中的笔记", type: "tag" },
];

// 示例元数据
const metaItems = [
  { key: "siteName", value: "ImQi1" },
  { key: "siteUrl", value: "https://imqi1.com" },
  { key: "siteDesc", value: "做技术的分享者、生活的摄影师、时事的评论员。" },
  { key: "siteKeywords", value: "棋,ImQi1,棋的小站,生活,科技,编程,学习" },
  { key: "siteIcp", value: "" },
  { key: "commentEnabled", value: "true" },
  { key: "commentModeration", value: "false" },
  { key: "commentAvatarService", value: "gravatar" },
  { key: "commentPageSize", value: "10" },
  { key: "commentMaxLevel", value: "4" },
  { key: "commentRequireMail", value: "true" },
  { key: "commentRequireLink", value: "false" },
  { key: "commentInterval", value: "60" },
  { key: "postPageSize", value: "12" },
  { key: "homeCustomText", value: '<p>本站新架构上线，由 Nuxt 4 构建，你所看见的都是测试数据，测试完毕后友联和数据会同步，请不要删除友联，可以的话，帮我找找 bug，谢谢 🙏</p>' },
  { key: "musicPlaylistId", value: "9255074836 || netease" },
  { key: "photoCategorySlug", value: "shot" },
  { key: "moderationApiType", value: "1" },
  { key: "baiduAppId", value: "" },
  { key: "baiduApiKey", value: "" },
  { key: "baiduSecretKey", value: "" },
  { key: "baiduCheckAdmin", value: "false" },
  { key: "emailLogEnabled", value: "true" },
  { key: "emailPushType", value: "none" },
  { key: "smtpHost", value: "" },
  { key: "smtpUser", value: "" },
  { key: "smtpAddress", value: "" },
  { key: "smtpPassword", value: "" },
  { key: "smtpSecureMode", value: "tls" },
  { key: "smtpPort", value: "465" },
  { key: "smtpFromName", value: "" },
  { key: "adminEmail", value: "" },
  { key: "notifyAdmin", value: "false" },
  { key: "uploadLocation", value: "local" },
  { key: "upyunDomain", value: "https://cdn.imqi1.com" },
  { key: "upyunService", value: "" },
  { key: "upyunOperator", value: "" },
  { key: "upyunPassword", value: "" },
  { key: "upyunImageProcess", value: "false" },
  { key: "upyunThumbnailVersion", value: "" },
  { key: "upyunOutputMode", value: "" },
  { key: "upyunTokenKey", value: "" },
  { key: "upyunTokenExpire", value: "1800" },
];

async function main() {
  console.log("🌱 [开发环境] 开始生成种子数据...");

  // 清空现有数据
  console.log("🗑️  清空现有数据...");
  await prisma.comment.deleteMany();
  await prisma.postrelation.deleteMany();
  await prisma.post.deleteMany();
  await prisma.category.deleteMany();
  await prisma.user.deleteMany();
  await prisma.informations.deleteMany();
  await prisma.subscribe.deleteMany();
  await prisma.changelog.deleteMany();
  await prisma.link.deleteMany();

  // 创建管理员用户
  console.log("👤 创建管理员用户...");
  const hashedPassword = await bcrypt.hash("123456", 10);
  const admin = await prisma.user.create({
    data: {
      name: "admin",
      nickname: "管理员",
      mail: "admin@example.com",
      password: hashedPassword,
      role: 1,
    },
  });
  console.log(`   ✅ 用户: ${admin.name} / 123456`);

  // 创建分类和标签
  console.log("📁 创建分类和标签...");
  await prisma.category.createMany({
    data: [...categories, ...tags],
    skipDuplicates: true,
  });
  console.log(`   ✅ 创建了 ${categories.length} 个分类和 ${tags.length} 个标签`);

  // 获取分类和标签ID
  const categoryRecords = await prisma.category.findMany();
  const categoryIds = categoryRecords.filter(c => c.type === "category").map(c => c.mid);
  const tagIds = categoryRecords.filter(c => c.type === "tag").map(c => c.mid);

  // 创建文章
  console.log("📝 创建文章...");
  const posts = [];
  // 获取图片分类的 mid
  const shotCategory = categoryRecords.find(c => c.slug === "shot");
  const shotCategoryMid = shotCategory?.mid;

  for (let i = 0; i < samplePosts.length; i++) {
    const postData = samplePosts[i];

    // 检查这篇文章是否会被分配到图片分类
    const numCategories = Math.floor(Math.random() * 2) + 1; // 1-2个分类
    const shuffledCategories = [...categoryIds].sort(() => Math.random() - 0.5);
    const assignedCategories = shuffledCategories.slice(0, numCategories);
    const isShotPost = assignedCategories.includes(shotCategoryMid!);

    // 随机分配2-4个标签
    const numTags = Math.floor(Math.random() * 3) + 2; // 2-4个标签
    const shuffledTags = [...tagIds].sort(() => Math.random() - 0.5);
    const assignedTags = shuffledTags.slice(0, numTags);

    // 为图片分类的文章生成封面
    let covers = null;
    if (isShotPost) {
      covers = JSON.stringify([
        {
          url: `https://picsum.photos/seed/shot${i}/600/400`,
          desc: `照片 ${i + 1}`,
        },
      ]);
    }

    // 生成随机的创建时间和更新时间（不一致）
    const now = new Date();
    const daysAgo = Math.floor(Math.random() * 365); // 0-365天前
    const createTime = new Date(now.getTime() - daysAgo * 24 * 60 * 60 * 1000);

    // 更新时间在创建时间之后的某个随机时间点
    const updateDaysAfter = Math.floor(Math.random() * 30); // 0-30天后
    const updateTime = new Date(createTime.getTime() + updateDaysAfter * 24 * 60 * 60 * 1000);

    const post = await prisma.post.create({
      data: {
        title: postData.title,
        desc: postData.desc,
        slug: postData.slug,
        content: postData.content,
        status: 1, // 已发布
        comment_num: Math.floor(Math.random() * 10),
        show_toc: true,
        uid: admin.uid, // 设置文章作者
        covers,
        create_time: createTime,
        update_time: updateTime,
      },
    });
    posts.push(post);

    // 为每篇文章分配分类
    for (let j = 0; j < numCategories; j++) {
      await prisma.postrelation.create({
        data: {
          cid: post.cid,
          mid: assignedCategories[j],
        },
      });
    }

    // 为每篇文章分配标签
    for (let j = 0; j < numTags; j++) {
      await prisma.postrelation.create({
        data: {
          cid: post.cid,
          mid: assignedTags[j],
        },
      });
    }
  }
  console.log(`   ✅ 创建了 ${posts.length} 篇文章`);

  // 创建评论
  console.log("💬 创建评论...");
  const commentCount = 50;
  let createdComments = 0;

  for (let i = 0; i < commentCount; i++) {
    const post = posts[Math.floor(Math.random() * posts.length)];
    const isReply = i > 5 && Math.random() > 0.6; // 40% 概率是回复
    const parentId = isReply ? Math.floor(Math.random() * i) + 1 : null;

    await prisma.comment.create({
      data: {
        cid: post.cid,
        name: `用户${i + 1}`,
        mail: `user${i + 1}@example.com`,
        link: `https://example.com/user${i + 1}`,
        content: sampleComments[Math.floor(Math.random() * sampleComments.length)],
        status: 1,
        parent_id: parentId,
        agent: "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36",
        ip: `192.168.1.${Math.floor(Math.random() * 255)}`,
      },
    });
    createdComments++;
  }
  console.log(`   ✅ 创建了 ${createdComments} 条评论`);

  // 创建元数据
  console.log("⚙️  创建元数据...");
  for (const item of metaItems) {
    await prisma.informations.upsert({
      where: { key: item.key },
      update: { value: item.value },
      create: item,
    });
  }
  console.log(`   ✅ 创建了 ${metaItems.length} 条元数据`);

  // 创建示例友情链接
  console.log("🔗 创建友情链接...");
  const links = [
    { name: "Vue.js", desc: "渐进式 JavaScript 框架", link: "https://vuejs.org", avatar: "https://vuejs.org/logo.svg", enabled: true },
    { name: "Nuxt", desc: "Vue.js 全栈框架", link: "https://nuxt.com", avatar: "https://nuxt.com/assets/design/test/logo-full.svg", enabled: true },
    { name: "Prisma", desc: "下一代 ORM", link: "https://www.prisma.io", avatar: "https://www.prisma.io/images/favicon.ico", enabled: true },
    { name: "Vite", desc: "下一代前端工具", link: "https://vitejs.dev", avatar: "https://vitejs.dev/logo.svg", enabled: true },
  ];
  await prisma.link.createMany({
    data: links,
  });
  console.log(`   ✅ 创建了 ${links.length} 个友情链接`);

  // 创建示例订阅
  console.log("📰 创建订阅列表...");
  const subscribes = [
    { name: "Vue Blog", url: "https://blog.vuejs.org/feed.xml", avatar: "https://vuejs.org/logo.svg" },
    { name: "Nuxt Blog", url: "https://nuxt.com/blog/feed.xml", avatar: "https://nuxt.com/assets/design/test/logo-full.svg" },
  ];
  await prisma.subscribe.createMany({
    data: subscribes,
  });
  console.log(`   ✅ 创建了 ${subscribes.length} 个订阅`);

  // 创建更新日志
  console.log("📋 创建更新日志...");
  const changelogs = [
    { class: "feature", desc: "添加用户管理功能" },
    { class: "improvement", desc: "优化文章列表加载速度" },
    { class: "fix", desc: "修复评论回复的显示问题" },
  ];
  await prisma.changelog.createMany({
    data: changelogs,
  });
  console.log(`   ✅ 创建了 ${changelogs.length} 条更新日志`);

  console.log("");
  console.log("✨ [开发环境] 种子数据生成完成！");
  console.log("");
  console.log("📊 数据统计：");
  console.log(`   - 用户: 1 (admin / 123456)`);
  console.log(`   - 文章: ${posts.length}`);
  console.log(`   - 评论: ${createdComments}`);
  console.log(`   - 分类: ${categories.length} 个 (小记、摄影、技术、讨论)`);
  console.log(`   - 标签: ${tags.length} 个`);
  console.log(`   - 元数据: ${metaItems.length}`);
  console.log(`   - 友情链接: ${links.length}`);
  console.log(`   - 订阅: ${subscribes.length}`);
  console.log(`   - 更新日志: ${changelogs.length}`);
  console.log("");
}

main()
  .catch(e => {
    console.error("❌ 种子数据生成失败:", e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
