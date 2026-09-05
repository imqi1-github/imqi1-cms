<script setup lang="ts">
import { siteConfig } from "~~/site.config";

const route = useRoute()

// 移动端侧边栏开关状态
const mobileSidebarOpen = ref(false)

// 切换移动端侧边栏
const toggleMobileSidebar = () => {
  mobileSidebarOpen.value = !mobileSidebarOpen.value
}

// 关闭移动端侧边栏
const closeMobileSidebar = () => {
  mobileSidebarOpen.value = false
}

// 监听路由变化，关闭移动端侧边栏
watch(() => route.path, () => {
  mobileSidebarOpen.value = false
})

// 根据路由获取页面标题
const pageTitle = computed(() => {
  // 如果路由元信息中定义了标题，优先使用
  if (route.meta.title) {
    return route.meta.title as string
  }

  // 路径到标题的映射
  const pathToTitle: Record<string, string> = {
    '/admin': '仪表盘',
    '/admin/contents': '文章管理',
    '/admin/pages': '页面管理',
    '/admin/comments': '评论管理',
    '/admin/categories': '分类管理',
    '/admin/tags': '标签管理',
    '/admin/users': '账户设置',
    '/admin/links': '友情链接',
    '/admin/travels': '旅行地点',
    '/admin/attachments': '附件管理',
    '/admin/subscribes': '订阅列表',
    '/admin/changelogs': '更新日志',
    '/admin/settings': '系统设置',
    '/admin/cache': '缓存管理',
  }

  // 精确匹配
  if (pathToTitle[route.path]) {
    return pathToTitle[route.path]
  }

  // 对于子路由（如 /admin/contents/edit），匹配父路径
  const parentPath = Object.keys(pathToTitle)
    .sort((a, b) => b.length - a.length) // 按长度降序，优先匹配更长的路径
    .find(path => route.path.startsWith(path + '/'))

  if (parentPath) {
    return pathToTitle[parentPath]
  }

  return '后台管理'
})

// 更新页面标题
useHead({
  title: computed(() => `${pageTitle.value} - ${siteConfig.siteName}后台管理`),
})

// 注意：会话验证已在 app/middleware/auth.global.ts 中处理
// 这里不再需要重复验证，避免 hydration mismatch

const navItems = [
  {
    title: '仪表盘',
    href: '/admin',
    icon: 'lucide:layout-dashboard',
  },
  {
    title: '文章管理',
    href: '/admin/contents',
    icon: 'lucide:file-text',
  },
  {
    title: '页面管理',
    href: '/admin/pages',
    icon: 'lucide:file',
  },
  {
    title: '评论管理',
    href: '/admin/comments',
    icon: 'lucide:message-square',
  },
  {
    title: '分类管理',
    href: '/admin/categories',
    icon: 'lucide:folder',
  },
  {
    title: '标签管理',
    href: '/admin/tags',
    icon: 'lucide:tag',
  },
  {
    title: '账户设置',
    href: '/admin/users',
    icon: 'lucide:user-cog',
  },
  {
    title: '友情链接',
    href: '/admin/links',
    icon: 'lucide:link',
  },
  {
    title: '旅行地点',
    href: '/admin/travels',
    icon: 'lucide:map-pin',
  },
  {
    title: '附件管理',
    href: '/admin/attachments',
    icon: 'lucide:paperclip',
  },
  {
    title: '订阅列表',
    href: '/admin/subscribes',
    icon: 'lucide:rss',
  },
  {
    title: '更新日志',
    href: '/admin/changelogs',
    icon: 'lucide:scroll-text',
  },
  {
    title: '系统设置',
    href: '/admin/settings',
    icon: 'lucide:settings',
  },
  {
    title: '缓存管理',
    href: '/admin/cache',
    icon: 'lucide:database-zap',
  },
]

const isActive = (href: string) => {
  if (href === '/admin') {
    return route.path === '/admin'
  }
  // 精确匹配或子路由匹配（但不匹配兄弟路由）
  if (route.path === href) {
    return true
  }
  // 对于有子路由的页面，检查是否以该路径开头且后面跟着 /
  return route.path.startsWith(href + '/');

}

const handleLogout = async () => {
  try {
    await $fetch('/api/auth/logout', { method: 'POST' })
  } catch {
    // 忽略错误
  } finally {
    await navigateTo('/login')
  }
}
</script>

<template>
  <div class="min-h-screen bg-background">
    <div class="flex">
      <!-- 移动端遮罩层 -->
      <Transition name="fade">
        <div
          v-if="mobileSidebarOpen"
          class="fixed inset-0 z-40 bg-black/50 lg:hidden"
          @click="closeMobileSidebar"
        />
      </Transition>

      <!-- 侧边栏 -->
      <aside
        class="fixed inset-y-0 left-0 z-50 w-48 border-r bg-card transition-transform duration-300 ease-in-out lg:z-10"
        :class="mobileSidebarOpen ? 'translate-x-0' : '-translate-x-full lg:translate-x-0'"
      >
        <ScrollArea class="h-full py-4">
          <!-- Logo -->
          <div class="px-6 mb-6 flex items-center justify-between">
            <h1 class="text-xl font-bold flex items-center gap-2">
              <Icon name="lucide:layout-dashboard" class="size-6" />
              后台管理
            </h1>
            <!-- 移动端关闭按钮 -->
            <Button
              variant="ghost"
              size="icon"
              class="lg:hidden"
              @click="closeMobileSidebar"
            >
              <Icon name="lucide:x" class="size-5" />
            </Button>
          </div>

          <!-- 导航菜单 -->
          <nav class="px-3 space-y-1">
            <NuxtLink
              v-for="item in navItems"
              :key="item.href"
              :to="item.href"
              class="flex items-center gap-3 px-3 py-2 rounded-md text-sm font-medium transition-colors"
              :class="
                isActive(item.href)
                  ? 'bg-primary text-primary-foreground'
                  : 'text-muted-foreground hover:bg-accent hover:text-accent-foreground'
              "
              @click="closeMobileSidebar"
            >
              <Icon :name="item.icon" class="size-4" />
              {{ item.title }}
            </NuxtLink>
          </nav>
        </ScrollArea>
      </aside>

      <!-- 主内容区：
           加 min-w-0：aside 是 fixed 不占文档流，flex-1 又用 lg:ml-48 让位。
           若不设 min-w-0，flex 默认 min-width:auto 会让该子元素按内容自然宽度收缩，
           内容（如横向富文本编辑器/长表格）把宽度顶出视口，产生横向滚动条。 -->
      <div class="flex-1 min-w-0 lg:ml-48">
        <!-- 顶部栏 -->
        <header class="sticky top-0 z-100 border-b bg-background/95 backdrop-blur supports-backdrop-filter:bg-background/60">
          <div class="flex h-14 items-center gap-4 px-4 lg:px-6">
            <!-- 汉堡菜单按钮（仅移动端显示） -->
            <Button
              variant="ghost"
              size="icon"
              class="lg:hidden"
              @click="toggleMobileSidebar"
            >
              <Icon name="lucide:menu" class="size-5" />
            </Button>

            <div class="flex-1">
              <h2 class="text-base font-semibold lg:text-lg">{{ pageTitle }}</h2>
            </div>

            <!-- 返回主页按钮 -->
            <Button
              v-tooltip="'返回主页'"
              variant="ghost"
              size="icon"
              class="mr-2"
              @click="() => navigateTo('/', { open: { target: '_blank' } })">
              <Icon name="lucide:home" class="size-5" />
            </Button>

            <Button
              v-tooltip="'退出登录'"
              variant="ghost"
              size="icon"
              @click="handleLogout"
            >
              <Icon name="lucide:log-out" class="size-5" />
            </Button>
          </div>
        </header>

        <!-- 页面内容 -->
        <main class="p-4 lg:p-6">
          <slot />
        </main>
      </div>
    </div>

    <!-- 全局确认弹窗（useConfirm 驱动，替代原生 confirm） -->
    <ConfirmDialog />
  </div>
</template>
