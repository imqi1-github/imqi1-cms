<script setup lang="ts">
import type { MenuItems } from "~/directives/contextMenu";

// 示例1：简单的文本菜单
const simpleMenu: MenuItems = [
  {
    label: "复制",
    icon: "ri:file-copy-line",
    action: () => {
      console.log("复制操作");
      alert("复制成功！");
    },
  },
  {
    label: "粘贴",
    icon: "ri:clipboard-line",
    action: () => {
      console.log("粘贴操作");
      alert("粘贴成功！");
    },
  },
];

// 示例2：带分隔线和禁用状态的菜单
const advancedMenu: MenuItems = [
  {
    label: "编辑",
    icon: "ri:edit-line",
    action: () => {
      console.log("编辑操作");
      alert("编辑");
    },
  },
  {
    label: "删除",
    icon: "ri:delete-bin-line",
    action: () => {
      console.log("删除操作");
      alert("删除");
    },
    danger: true, // 危险操作，红色样式
  },
  {
    divider: true, // 分隔线
  },
  {
    label: "刷新",
    icon: "ri:refresh-line",
    action: () => {
      console.log("刷新操作");
      location.reload();
    },
  },
  {
    label: "禁用选项",
    icon: "ri:prohibited-line",
    action: () => {
      console.log("这个操作不会执行");
    },
    disabled: true, // 禁用状态
  },
];

// 示例3：复杂功能的菜单
const complexMenu: MenuItems = [
  {
    label: "百度搜索",
    icon: "ri:baidu-fill",
    action: (e: MouseEvent) => {
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
      } else {
        alert("请先选中文字");
      }
    },
  },
  {
    divider: true,
  },
  {
    label: "复制链接",
    icon: "ri:link",
    action: () => {
      navigator.clipboard.writeText(window.location.href);
      alert("链接已复制");
    },
  },
  {
    label: "在新标签页打开",
    icon: "ri:external-link-line",
    action: () => {
      window.open(window.location.href, "_blank");
    },
  },
];
</script>

<template>
  <div class="context-menu-demo">
    <h1>右键菜单指令示例</h1>

    <div class="demo-section">
      <h2>示例1：简单菜单</h2>
      <div
        v-context-menu="simpleMenu"
        class="demo-box"
      >
        在这个区域右键点击，查看简单的复制/粘贴菜单
      </div>
    </div>

    <div class="demo-section">
      <h2>示例2：高级菜单</h2>
      <div
        v-context-menu="advancedMenu"
        class="demo-box"
      >
        在这个区域右键点击，查看包含分隔线、危险操作和禁用状态的菜单
      </div>
    </div>

    <div class="demo-section">
      <h2>示例3：复杂功能菜单</h2>
      <div
        v-context-menu="complexMenu"
        class="demo-box"
      >
        先选中一些文字，然后在这个区域右键点击，可以搜索选中的文字
      </div>
    </div>

    <div class="usage">
      <h2>使用说明</h2>
      <pre><code>&lt;script setup lang="ts"&gt;
import type { MenuItems } from "~/directives/contextMenu";

const menuItems: MenuItems = [
  {
    icon: "ri:edit-line",        // 可选：图标名称（支持 iconify）
    label: "编辑",               // 必需：菜单项文字
    action: () => {             // 必需：点击执行的函数
      console.log("编辑操作");
    },
    divider: false,              // 可选：是否为分隔线
    disabled: false,             // 可选：是否禁用
    danger: false,               // 可选：是否为危险操作（红色）
  },
];
&lt;/script&gt;

&lt;template&gt;
  &lt;div v-context-menu="menuItems"&gt;
    右键点击我
  &lt;/div&gt;
&lt;/template&gt;</code></pre>
    </div>
  </div>
</template>

<style scoped>
.context-menu-demo {
  padding: 2rem;
  max-width: 1200px;
  margin: 0 auto;
}

h1 {
  font-size: 2rem;
  font-weight: bold;
  margin-bottom: 2rem;
  color: #1f2937;
}

.dark h1 {
  color: #f3f4f6;
}

h2 {
  font-size: 1.25rem;
  font-weight: 600;
  margin-bottom: 1rem;
  color: #374151;
}

.dark h2 {
  color: #d1d5db;
}

.demo-section {
  margin-bottom: 2rem;
}

.demo-box {
  padding: 2rem;
  background: #f9fafb;
  border: 2px dashed #d1d5db;
  border-radius: 0.5rem;
  cursor: context-menu;
  transition: all 0.2s;
}

.dark .demo-box {
  background: #1e293b;
  border-color: #475569;
}

.demo-box:hover {
  border-color: #3b82f6;
  background: #eff6ff;
}

.dark .demo-box:hover {
  border-color: #60a5fa;
  background: #1e3a8a;
}

.usage {
  margin-top: 3rem;
  padding: 1.5rem;
  background: #fef3c7;
  border-left: 4px solid #f59e0b;
  border-radius: 0.375rem;
}

.dark .usage {
  background: #451a03;
  border-left-color: #d97706;
}

pre {
  background: #1f2937;
  color: #f3f4f6;
  padding: 1rem;
  border-radius: 0.375rem;
  overflow-x: auto;
  font-size: 0.875rem;
  line-height: 1.5;
}

code {
  font-family: "Monaco", "Menlo", "Ubuntu Mono", monospace;
}
</style>
