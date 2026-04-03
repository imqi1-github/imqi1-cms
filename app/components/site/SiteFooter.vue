<script setup lang="ts">
const currentYear = new Date().getFullYear();
</script>

<template>
  <footer class="bg-gray-50 border-t border-gray-200 mt-auto">
    <div class="max-w-6xl mx-auto px-5 py-10 pb-5 flex flex-wrap gap-10">
      <!-- 左侧信息 -->
      <div class="flex-1 min-w-48">
        <h3 class="text-lg font-semibold text-gray-800 mb-2">ImQi1</h3>
        <p class="text-sm text-gray-600 leading-relaxed">做技术的分享者、生活的摄影师、时事的评论员。</p>
      </div>

      <!-- 链接 -->
      <div class="flex gap-10 flex-wrap">
        <div class="min-w-30">
          <h4 class="text-sm font-semibold text-gray-700 mb-3">快速链接</h4>
          <ul class="list-none p-0 m-0">
            <li class="mb-2"><a href="/" class="text-sm text-gray-600 hover:text-blue-500 transition-colors no-underline">首页</a></li>
            <li class="mb-2"><a href="/subscribes" class="text-sm text-gray-600 hover:text-blue-500 transition-colors no-underline">订阅</a></li>
          </ul>
        </div>

        <div class="min-w-30">
          <h4 class="text-sm font-semibold text-gray-700 mb-3">友情链接</h4>
          <ul class="list-none p-0 m-0">
            <li class="mb-2"><a href="https://vuejs.org" target="_blank" rel="noopener" class="text-sm text-gray-600 hover:text-blue-500 transition-colors no-underline">Vue.js</a></li>
            <li class="mb-2"><a href="https://nuxt.com" target="_blank" rel="noopener" class="text-sm text-gray-600 hover:text-blue-500 transition-colors no-underline">Nuxt</a></li>
            <li class="mb-2"><a href="https://www.prisma.io" target="_blank" rel="noopener" class="text-sm text-gray-600 hover:text-blue-500 transition-colors no-underline">Prisma</a></li>
          </ul>
        </div>
      </div>

      <!-- 社交图标 -->
      <div class="flex gap-3">
        <a href="https://github.com" target="_blank" rel="noopener" class="flex items-center justify-center w-10 h-10 rounded-full bg-white border border-gray-200 text-gray-600 hover:border-blue-500 hover:text-blue-500 hover:-translate-y-0.5 transition-all" title="GitHub">
          <Icon name="lucide:github" class="w-[18px] h-[18px]" />
        </a>
        <a href="https://twitter.com" target="_blank" rel="noopener" class="flex items-center justify-center w-10 h-10 rounded-full bg-white border border-gray-200 text-gray-600 hover:border-blue-500 hover:text-blue-500 hover:-translate-y-0.5 transition-all" title="Twitter">
          <Icon name="lucide:twitter" class="w-[18px] h-[18px]" />
        </a>
        <a href="mailto:hi@imqi1.com" class="flex items-center justify-center w-10 h-10 rounded-full bg-white border border-gray-200 text-gray-600 hover:border-blue-500 hover:text-blue-500 hover:-translate-y-0.5 transition-all" title="Email">
          <Icon name="lucide:mail" class="w-[18px] h-[18px]" />
        </a>
      </div>
    </div>

    <!-- 底部版权 -->
    <div class="max-w-6xl mx-auto px-5 py-5 border-t border-gray-200 text-center">
      <p class="text-sm text-gray-400 m-0">&copy; {{ currentYear }} ImQi1. All rights reserved.</p>
    </div>
  </footer>
</template>

<style scoped>
.no-underline {
  text-decoration: none;
}
</style>
