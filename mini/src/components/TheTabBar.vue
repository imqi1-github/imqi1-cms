<script setup lang="ts">
// 底部 tab：自定义 wd-tabbar + wd-icon 字体图标
// 无原生 tabBar，切换走 reLaunch（轻量页面无需缓存）
// 当前高亮由各页面通过 active prop 指定，点击触发跳转
type TabKey = 'index' | 'archive' | 'category' | 'about'

const props = defineProps<{ active: TabKey }>()

interface Tab {
  key: TabKey
  title: string
  icon: string
  url: string
}

const tabs: Tab[] = [
  { key: 'index', title: '首页', icon: 'home', url: '/pages/index/index' },
  { key: 'archive', title: '归档', icon: 'folder', url: '/pages/archive/index' },
  { key: 'category', title: '分类', icon: 'list', url: '/pages/category/index' },
  { key: 'about', title: '关于', icon: 'user', url: '/pages/about/index' },
]

function onChange(e: { value: string | number }) {
  const key = e.value as TabKey
  const tab = tabs.find(t => t.key === key)
  if (!tab || tab.key === props.active) return
  uni.reLaunch({ url: tab.url })
}
</script>

<template>
  <wd-tabbar
    :model-value="active"
    fixed
    bordered
    placeholder
    safe-area-inset-bottom
    active-color="#3b82f6"
    inactive-color="#94a3b8"
    z-index="99"
    @change="onChange"
  >
    <wd-tabbar-item
      v-for="t in tabs"
      :key="t.key"
      :name="t.key"
      :title="t.title"
      :icon="t.icon"
    />
  </wd-tabbar>
</template>
