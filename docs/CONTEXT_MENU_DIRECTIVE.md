# 右键菜单自定义指令使用文档

一个简单易用的 Vue 3/Nuxt 3 右键菜单自定义指令，支持通过对象数组配置菜单项。

## 特性

✅ **简单易用** - 通过数组对象配置菜单项
✅ **图标支持** - 支持 Iconify 图标库
✅ **样式丰富** - 支持深色模式、危险操作、禁用状态、分隔线
✅ **智能定位** - 自动调整菜单位置，避免超出屏幕
✅ **类型安全** - 完整的 TypeScript 类型支持

## 安装

插件已经自动注册到项目中，可以直接在任何组件中使用。

## 基础用法

```vue
<script setup lang="ts">
import type { MenuItems } from "~/directives/contextMenu";

const menuItems: MenuItems = [
  {
    icon: "ri:edit-line",        // 可选：图标名称
    label: "编辑",               // 必需：菜单项文字
    action: () => {             // 必需：点击执行的函数
      console.log("编辑操作");
    },
  },
];
</script>

<template>
  <div v-context-menu="menuItems">
    右键点击我
  </div>
</template>
```

## 配置选项

### MenuItem 类型

```typescript
interface MenuItem {
  icon?: string;              // 可选：图标名称（支持 Iconify 图标）
  label: string;              // 必需：菜单项文字
  action: (e: MouseEvent) => void;  // 必需：点击执行的函数
  divider?: boolean;          // 可选：是否为分隔线（默认 false）
  disabled?: boolean;         // 可选：是否禁用（默认 false）
  danger?: boolean;           // 可选：是否为危险操作，红色样式（默认 false）
}
```

## 高级用法示例

### 1. 带分隔线的菜单

```typescript
const menuItems: MenuItems = [
  {
    label: "复制",
    icon: "ri:file-copy-line",
    action: () => {
      navigator.clipboard.writeText("已复制");
    },
  },
  {
    label: "粘贴",
    icon: "ri:clipboard-line",
    action: () => {
      console.log("粘贴");
    },
  },
  {
    divider: true,  // 添加分隔线
  },
  {
    label: "删除",
    icon: "ri:delete-bin-line",
    danger: true,   // 危险操作，红色样式
    action: () => {
      console.log("删除");
    },
  },
];
```

### 2. 禁用状态的菜单项

```typescript
const menuItems: MenuItems = [
  {
    label: "可用选项",
    icon: "ri:check-line",
    action: () => {
      console.log("可以点击");
    },
  },
  {
    label: "禁用选项",
    icon: "ri:prohibited-line",
    disabled: true,  // 禁用状态
    action: () => {
      console.log("这个不会执行");
    },
  },
];
```

### 3. 带搜索功能的菜单

```typescript
const searchMenu: MenuItems = [
  {
    label: "百度搜索",
    icon: "ri:baidu-fill",
    action: () => {
      const text = window.getSelection()?.toString().trim();
      if (text) {
        window.open(`https://www.baidu.com/s?wd=${encodeURIComponent(text)}`, "_blank");
      } else {
        alert("请先选中文字");
      }
    },
  },
  {
    label: "Google搜索",
    icon: "material-icon-theme:google",
    action: () => {
      const text = window.getSelection()?.toString().trim();
      if (text) {
        window.open(`https://www.google.com/search?q=${encodeURIComponent(text)}`, "_blank");
      }
    },
  },
];
```

### 4. 动态菜单项

```vue
<script setup lang="ts">
import { ref } from "vue";

const canEdit = ref(true);

const dynamicMenu: MenuItems = computed(() => [
  {
    label: "编辑",
    icon: "ri:edit-line",
    disabled: !canEdit.value,  // 动态控制禁用状态
    action: () => {
      console.log("编辑");
    },
  },
  {
    label: "删除",
    icon: "ri:delete-bin-line",
    danger: true,
    action: () => {
      canEdit.value = false;
    },
  },
]);
</script>

<template>
  <div v-context-menu="dynamicMenu">
    右键点击我
  </div>
</template>
```

## 常用图标示例

项目使用 Remix Icon 和 Material Icon Themes 图标库：

### 常用操作图标

```typescript
// 编辑相关
"ri:edit-line"              // 编辑
"ri:file-copy-line"         // 复制
"ri:clipboard-line"         // 粘贴
"ri:scissors-cut-line"      // 剪切
"ri:delete-bin-line"        // 删除

// 导航相关
"ri:arrow-left-line"        // 返回
"ri:arrow-right-line"       // 前进
"ri:refresh-line"           // 刷新
"ri:arrow-up-line"          // 向上
"ri:external-link-line"     // 外部链接

// 搜索相关
"ri:baidu-fill"             // 百度
"material-icon-theme:google" // Google
"ri:search-line"            // 搜索

// 其他
"ri:link"                   // 链接
"ri:heading"                // 标题
"ri:file-text-line"         // 文本
"ri:printer-line"           // 打印
"ri:checkbox-circle-line"   // 全选
```

更多图标请访问：
- [Remix Icon](https://icon-sets.iconify.design/ri/)
- [Material Icon Themes](https://icon-sets.iconify.design/material-icon-theme/)

## 样式定制

菜单样式定义在 `~/assets/styles/context-menu.css` 中，可以根据需要进行修改。

### 深色模式支持

菜单会自动适配深色模式，无需额外配置。

## 注意事项

1. **只在客户端运行** - 右键菜单指令只在客户端生效（`.client.ts` 插件）
2. **事件冒泡** - 菜单点击后会自动关闭，不会冒泡到父元素
3. **自动关闭** - 点击页面其他区域或滚动页面时，菜单会自动关闭
4. **图标显示** - 确保图标名称正确，否则图标不会显示

## 完整示例

查看 `~/components/ContextMenuExample.vue` 获取更多使用示例。

## 文件结构

```
app/
├── directives/
│   └── contextMenu.ts              # 指令实现
├── plugins/
│   └── context-menu.client.ts      # 插件注册
├── assets/styles/
│   └── context-menu.css           # 样式文件
└── components/
    └── ContextMenuExample.vue     # 使用示例
```

## 类型导出

```typescript
import type { MenuItem, MenuItems } from "~/directives/contextMenu";
```

## 常见问题

### Q: 如何在多个组件中共享菜单配置？

A: 可以将菜单配置提取到单独的文件中：

```typescript
// ~/context-menus.ts
import type { MenuItems } from "~/directives/contextMenu";

export const commonMenu: MenuItems = [
  // ... 菜单项
];
```

### Q: 如何异步加载菜单数据？

A: 使用 `computed` 实现异步菜单：

```typescript
const menuItems = computed(() => {
  return asyncData.value.map(item => ({
    label: item.name,
    action: () => handleAction(item.id),
  }));
});
```

### Q: 如何在菜单项中使用外部组件的上下文？

A: action 函数会保留定义时的词法作用域，可以直接访问外部变量：

```typescript
const handleClick = (id: string) => {
  console.log("点击了", id);
};

const menuItems: MenuItems = [
  {
    label: "操作",
    action: () => handleClick("123"),  // 可以访问外部函数
  },
];
```
