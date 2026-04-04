# Prism v2 模块

代码高亮模块第二版，基于 Prism.js 的增强版本，提供更多功能和更好的用户体验。

## 功能特性

- 多语言代码高亮
- 行号显示
- 代码复制功能
- 代码块工具栏
- 语法主题定制
- 更好的性能优化

## 文件结构

```
prism-v2/
├── prism.js             # Prism 配置文件
├── webpack.config.js    # Webpack 配置
├── compress_css.js      # CSS 压缩脚本
└── package.json         # 项目配置
```

## 构建

### 安装依赖

```bash
npm install
```

### 构建脚本

```bash
# 压缩 JavaScript
npm run "compress prism-v2 js"

# 压缩 CSS
npm run "compress prism-v2 css"
```

### 输出

- JavaScript: `../../usr/themes/NewImQi1/public/js/prism-v2.js`
- CSS: `../../usr/themes/NewImQi1/public/css/prism-v2.css`

## 依赖

### 开发依赖

- `webpack` ^5.104.1 - 模块打包
- `webpack-cli` ^6.0.1 - Webpack 命令行工具
- `terser-webpack-plugin` ^5.3.16 - JavaScript 压缩
- `postcss` ^8.5.6 - CSS 后处理器
- `cssnano` ^7.1.2 - CSS 压缩优化
- `webpack-shell-plugin-next` ^2.3.3 - 构建后处理

## 使用方法

在 Markdown 或 HTML 中使用代码块：

````markdown
```javascript
const greeting = "Hello World";
console.log(greeting);
```
````

代码块会自动应用语法高亮、行号和工具栏。

## v2 版本改进

相比 v1 版本，v2 提供了：

- 更完善的工具栏功能
- 更好的主题支持
- 性能优化
- 更多插件支持
- 更好的移动端体验

## 技术栈

- Prism.js - 代码高亮核心
- Webpack 5 - 模块打包
- Terser - JavaScript 压缩
- PostCSS + cssnano - CSS 处理和压缩

## 浏览器支持

- Chrome/Edge 90+
- Firefox 88+
- Safari 14+
- 移动端浏览器
