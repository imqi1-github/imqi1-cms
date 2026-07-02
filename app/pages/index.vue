<template>
  <div class="min-h-screen relative w-full bg-white dark:bg-[#0a0a0a]">
    <!-- 英雄区 - fixed定位，独立于section -->
    <h1 id="index-hero-title" class="sr-only">欢迎来到 {{ siteName }}</h1>
    <div ref="heroRef" class="fixed inset-0 flex flex-col items-center justify-center max-w-250 w-[90vw] mx-auto left-0 right-0" :style="heroStyle">
      <div v-scroll-reveal class="flex items-center justify-between w-full opacity-0 max-md:flex-col max-md:text-center max-md:gap-8">
        <!-- 标题区域 -->
        <div class="p-1.5">
          <h1 class="text-slate-900 dark:text-white text-[5em] font-black leading-none max-md:text-[3em]">
            IM<span class="text-red-600 dark:text-red-500">QI1</span>.COM
          </h1>
          <div class="mt-4 text-slate-600 dark:text-gray-400 text-base" v-html="homeAnnounce" />
        </div>

        <!-- 头像区域 -->
        <div class="h-fit max-md:hidden">
          <img
            :src="siteConfig.siteAvatarPath"
            alt="头像"
            fetchpriority="high"
            class="rounded-full max-w-50 w-50 h-50 object-cover max-md:max-w-30 max-md:w-30 max-md:h-30" >
        </div>

        <!-- 滚动提示 -->
        <div class="absolute -bottom-20 left-1/2 -translate-x-1/2 text-gray-600 dark:text-gray-500 animate-bounce max-md:-bottom-20">
          <Icon name="ri:mouse-line" class="size-4" />
        </div>
      </div>

      <!-- 联系链接 -->
      <div v-scroll-reveal class="flex mt-3 self-start max-md:mx-auto max-md:flex-wrap max-md:justify-center">
        <template v-for="(link, index) in contactLinks" :key="index">
          <NuxtLink
            v-tooltip="link.name"
            :href="link.link"
            :target="link.target ? '_blank' : undefined"
            :aria-label="link.name"
            class="group relative flex items-center justify-center w-9 h-9 rounded-md transition-all duration-200 text-gray-500 dark:text-gray-400 hover:bg-slate-100 dark:hover:bg-gray-800 hover:text-slate-900 dark:hover:text-white">
            <Icon :name="link.icon" aria-hidden="true" class="size-5" mode="svg" />
          </NuxtLink>
        </template>
      </div>
    </div>

    <!-- 占位section，用于撑开页面高度 -->
    <section class="h-[calc(100vh-250px)] mb-62.5" aria-hidden="true" />

    <!-- 为什么要做这个网站 -->
    <section v-scroll-reveal class="mx-auto max-w-275" aria-labelledby="index-why-title">
      <h2 id="index-why-title" class="text-slate-500 dark:text-gray-400 text-sm">？ 为什么要做这个网站</h2>
      <div class="tracking-[0.1ch] leading-[1.7em] mt-2.5 max-w-187.5">
        <p class="my-2.5 text-slate-700 dark:text-gray-300">
          起初建站只是一时兴起，和大多数人一样，我只是想记录下自己学习编程的心路历程和笔记，供自己以后有个参考。刚开始我以为有一个自己的网站是一个小众爱好，直到后来我才发现网络上有很多对此感兴趣的伙伴，于是我开始和他们保持联系。随着时间的增长，我对软件开发有了更浓厚的兴趣，我开始和同学、朋友交流，也有了自己独立开发的想法。在这之前我曾换过多个框架、主题，最终还是觉得自己开发一个主题最有成就感，也最能证明自己真正地学到了东西，所以你能在这里看到这些文字，也能看到我在此记录的其他内容。
        </p>
        <p class="my-2.5 text-slate-700 dark:text-gray-300">我喜欢游山玩水，有自己的爱好，活动。我觉得一切有趣的事情，都会在此记录。</p>
      </div>
    </section>

    <!-- 四个内容的父盒子 -->
    <div class="pt-37.5">
      <!-- 网站架构 -->
      <section ref="sectionFramework" v-scroll-reveal aria-labelledby="index-framework-title">
        <div class="max-w-fit w-full mx-auto">
          <div class="mb-10">
            <h2 id="index-framework-title" class="text-blue-700 dark:text-blue-500 text-sm">网站架构</h2>
            <div class="text-slate-800 dark:text-white text-[1.6em] font-bold my-1">高开发效率 + 类型安全 + 全栈统一</div>
            <div class="text-slate-500 dark:text-gray-400 text-sm inline">
              <p>Nuxt4 为本站提供了快速、简单、可维护的网站架构</p>
            </div>
            <div class="text-slate-500 dark:text-gray-400 text-sm inline">
              <p>Prisma 提供了类型安全的数据库操作，确保数据的一致性和完整性</p>
            </div>
          </div>
          <div class="flex items-center justify-center gap-8 flex-wrap max-md:flex-col">
            <div class="flex flex-col relative">
              <Icon name="devicon:nuxtjs-wordmark" mode="svg" class="size-25" />
            </div>
            <div class="max-md:mt-7">
              <Icon name="ri:add-large-line" class="text-2xl text-slate-400 dark:text-gray-500" />
            </div>
            <div class="flex flex-col relative">
              <Icon name="devicon:prisma-wordmark" mode="svg" class="size-25" />
            </div>
            <div class="max-md:mt-7">
              <Icon name="ri:add-large-line" class="text-2xl text-slate-400 dark:text-gray-500" />
            </div>
            <div class="flex flex-col relative">
              <Icon name="logos:mysql" mode="svg" class="size-25" />
            </div>
          </div>
          <div class="mt-20 font-medium max-w-200 mx-auto text-center text-slate-600 dark:text-gray-300 leading-relaxed">
            本站主题为 Glass，是我制作的第二款主题，从 2026 年 4 月开始制作，至今持续更新中。这一版基于 Nuxt 4 与 TypeScript 前后端同构搭建，配合
            Tailwind CSS 构建现代化响应式布局，集成 APlayer 音乐播放器、Fancybox
            图片灯箱、实况照片与轮播等富媒体组件，为文章内容提供更丰富的交互体验。系统涵盖文章、评论、友链、订阅、归档与搜索等完整博客功能，配合完善的后台管理，构成一套真正意义上的全栈内容管理系统。
          </div>
        </div>
      </section>

      <!-- 大间隔 -->
      <div class="h-62.5" />

      <!-- 样式选择 -->
      <div ref="sectionStyle" v-scroll-reveal class="-mt-5 mx-auto max-w-200">
        <div>
          <div class="mb-30 max-md:text-center">
            <h2 class="text-blue-700 dark:text-blue-500 text-sm">样式选择</h2>
            <div class="text-slate-800 dark:text-white text-[1.6em] font-bold my-1">保持界面清爽，同时不牺牲功能丰富度</div>
            <div class="text-slate-500 dark:text-gray-400 text-sm">选择字体类型，合理规划布局，注意颜色搭配，添加边框圆角。</div>
          </div>
          <div class="flex max-md:justify-center">
            <!-- 左侧选项 -->
            <div class="flex flex-col gap-12.5">
              <div
                v-for="(item, index) in themeItems"
                :key="index"
                :ref="setThemeItemRef"
                class="flex flex-col items-start justify-center h-75 max-w-75">
                <div class="text-slate-500 dark:text-gray-400 text-sm">{{ item.title }}</div>
                <div v-if="item.type === 'grid'" class="grid grid-cols-[auto_1fr] gap-x-4 gap-y-1.5 mt-2.5 max-w-75">
                  <template v-for="(grid, gIndex) in item.grids" :key="gIndex">
                    <div v-if="grid.isLink">
                      <a :href="grid.href" class="hover:underline text-blue-600 dark:text-blue-400 font-weight" target="_blank">{{ grid.text }}</a>
                    </div>
                    <div v-else-if="grid.isCode">
                      <code class="bg-slate-100 dark:bg-gray-800 px-1 rounded text-sm text-slate-800 dark:text-gray-200">{{ grid.text }}</code>
                    </div>
                    <div v-else-if="grid.hasIcon" class="flex items-center gap-1 text-slate-700 dark:text-gray-300">
                      {{ grid.text }}
                    </div>
                    <div v-else-if="grid.isCategory" class="text-slate-800 dark:text-gray-200">
                      {{ grid.text }}
                    </div>
                    <NuxtLink v-else-if="grid.href" :to="grid.href" class="hover:underline text-blue-600 dark:text-blue-400">
                      {{ grid.text }}
                    </NuxtLink>
                    <div v-else class="text-slate-700 dark:text-gray-300">{{ grid.text }}</div>
                  </template>
                </div>
                <div v-else class="tracking-[0.1ch] mt-5 text-slate-700 dark:text-gray-300">
                  {{ item.content }}
                </div>
              </div>
            </div>

            <!-- 右侧展示 -->
            <div class="flex-1 flex justify-end relative max-md:hidden">
              <div class="flex items-center justify-center w-full h-0 sticky top-1/2 my-38">
                <div
                  v-for="(rightItem, index) in themeRightItems"
                  :key="index"
                  class="h-75 opacity-0 invisible absolute transition-opacity duration-300"
                  :class="{ 'opacity-100 pointer-events-auto visible': activeThemeIndex === index }">
                  <!-- 字体展示 -->
                  <div v-if="rightItem.type === 'fonts'" class="relative h-75 w-75">
                    <div
                      class="grid grid-cols-2 grid-rows-2 place-items-center justify-items-center text-[2.5em] font-bold border border-slate-200 dark:border-gray-700 bg-white dark:bg-gray-900 rounded-xl shadow-sm h-38 w-38 absolute left-28 top-19 animate-float text-slate-900 dark:text-white">
                      <span>之</span>
                      <span>的</span>
                      <span>事</span>
                      <span>以</span>
                    </div>
                    <code
                      class="bg-slate-50 dark:bg-gray-800 border border-slate-200 dark:border-gray-700 rounded shadow-sm px-2 py-1 absolute left-2.5 bottom-14 animate-float-delay-1 text-slate-800 dark:text-gray-200">
                      <span class="text-blue-700 dark:text-blue-400">print</span>(<span class="text-green-700 dark:text-green-400">"Hello World"</span
                      >)
                    </code>
                    <div
                      class="grid grid-cols-2 grid-rows-2 place-items-center justify-items-center text-xl bg-slate-50 dark:bg-gray-800 border border-slate-200 dark:border-gray-700 rounded shadow-sm h-19 w-19 absolute left-14 top-8 animate-float-delay-2">
                      <span>
                        <Icon name="ri:attachment-line" class="text-slate-600 dark:text-gray-400" />
                      </span>
                      <span>
                        <Icon name="ri:file-zip-fill" class="text-slate-600 dark:text-gray-400" />
                      </span>
                      <span>
                        <Icon name="ri:video-fill" class="text-slate-600 dark:text-gray-400" />
                      </span>
                      <span>
                        <Icon name="ri:restart-line" class="text-slate-600 dark:text-gray-400" />
                      </span>
                    </div>
                  </div>

                  <!-- 布局图片 -->
                  <div v-else-if="rightItem.type === 'layout'" class="relative h-75 w-75 group">
                    <div
                      class="absolute top-6 left-6 w-50 h-50 rounded-xl shadow-sm bg-cover bg-center border border-slate-200 dark:border-gray-700 bg-white dark:bg-gray-900 overflow-hidden group-hover:-translate-x-1 duration-200">
                      <img
                        :src="publicAsset('/imgs/shenyang.webp')"
                        loading="lazy"
                        class="absolute inset-0 aspect-square object-cover"
                        alt="沈阳站" >
                    </div>
                    <div
                      class="absolute top-31 left-36 w-38 h-38 bg-slate-100 dark:bg-gray-800 rounded-xl border border-slate-200 dark:border-gray-700 transition-transform group-hover:translate-x-1 duration-200 shadow-sm" />
                  </div>

                  <!-- 音乐播放器 - 延迟加载 -->
                  <div v-else-if="rightItem.type === 'music'" class="relative h-75 w-75 flex items-center justify-center">
                    <ClientOnly>
                      <div class="absolute top-1/2 -left-24 -right-15 -translate-y-1/2">
                        <MetingPlayer id="2142943893" server="netease" type="song" :list-folded="false" :mutex="true" />
                      </div>
                      <template #fallback>
                        <div class="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 text-slate-400 dark:text-gray-500 text-sm">
                          音乐播放器加载中...
                        </div>
                      </template>
                    </ClientOnly>
                  </div>

                  <!-- 文章预览 - 客户端渲染以确保随机性 -->
                  <ClientOnly>
                    <div v-if="rightItem.type === 'article'" class="relative h-75 w-75 flex items-center justify-center">
                      <div v-if="randomPost" class="flex flex-col w-full h-full justify-center">
                        <!-- 封面 -->
                        <div
                          v-if="randomPost.covers && randomPost.covers.length > 0"
                          class="relative mb-3 rounded-lg overflow-hidden h-40 border-px border-solid border-slate-200 dark:border-gray-700">
                          <img
                            :src="(typeof randomPost.covers[0] === 'string' ? randomPost.covers[0] : randomPost.covers[0]?.url) || ''"
                            :alt="randomPost.title"
                            class="w-full h-full object-cover"
                            loading="lazy" >
                          <!-- 关联地点角标 -->
                          <div
                            v-if="randomPost.travelCount > 0"
                            class="absolute top-2 right-2 z-10 flex items-center gap-1 px-2 py-1 rounded-md bg-black/60 text-white text-xs font-medium backdrop-blur-sm">
                            <Icon name="ri:map-pin-line" class="size-3.5" />
                            <span>{{ randomPost.travelCount }}</span>
                          </div>
                        </div>
                        <!-- 标题 -->
                        <h3 class="text-slate-900 dark:text-white font-bold text-base line-clamp-2 mb-2">
                          {{ randomPost.title }}
                        </h3>
                        <!-- 描述 -->
                        <p v-if="randomPost.desc" class="text-slate-500 dark:text-gray-400 text-sm line-clamp-3">
                          {{ randomPost.desc }}
                        </p>
                        <p v-else class="text-slate-400 dark:text-gray-500 text-sm italic">暂无描述</p>
                        <!-- 链接 -->
                        <NuxtLink
                          :to="`/content/${randomPost.category?.slug || 'post'}/${randomPost.slug || randomPost.cid}`"
                          class="pt-3 text-blue-600 dark:text-blue-400 text-sm hover:underline">
                          阅读全文 →
                        </NuxtLink>
                      </div>
                      <div v-else class="flex flex-col items-center justify-center h-full w-full">
                        <div class="text-slate-500 dark:text-gray-400 text-sm">暂无文章</div>
                      </div>
                    </div>
                    <template #fallback>
                      <div class="relative h-75 w-75 flex items-center justify-center">
                        <div class="text-slate-400 dark:text-gray-500 text-sm">文章加载中...</div>
                      </div>
                    </template>
                  </ClientOnly>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>

      <!-- 间隔 -->
      <div class="h-62.5" />

      <!-- 最新文章 -->
      <section ref="sectionContent" v-scroll-reveal class="mx-auto max-w-275" aria-labelledby="index-recent-posts-title">
        <div class="flex items-center justify-between mb-6">
          <div>
            <h2 id="index-recent-posts-title" class="text-blue-700 dark:text-blue-500 text-sm">文章内容</h2>
            <div class="text-slate-800 dark:text-white text-[1.6em] font-bold my-1">最新发布的内容</div>
            <div class="text-slate-500 dark:text-gray-400 text-sm">生活中的小事、照片，感兴趣的技术等</div>
          </div>

          <!-- 查看更多 -->
          <template v-if="recentPosts.length > 0">
            <NuxtLink to="/archiving" class="inline-flex items-center gap-1 text-blue-600 dark:text-blue-400 hover:underline text-sm">
              查看全部文章
              <Icon name="ri:arrow-right-line" aria-hidden="true" class="size-4" />
            </NuxtLink>
          </template>
        </div>

        <!-- 文章列表 -->
        <div v-if="recentPosts.length > 0" class="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4 mb-12">
          <NuxtLink
            v-for="post in recentPosts"
            :key="post.cid"
            :to="`/content/${post.categories?.[0]?.slug || 'post'}/${post.slug || post.cid}`"
            :aria-label="`阅读文章：${post.title}`"
            class="block no-underline group">
            <div
              class="relative rounded-xl border border-slate-200 dark:border-gray-700 overflow-hidden hover:border-blue-500 dark:hover:border-blue-600 shadow-sm hover:shadow-md transition-all duration-300 h-55 flex flex-col">
              <!-- 封面占满整卡 -->
              <div v-if="post.covers && post.covers.length > 0" class="absolute inset-0">
                <img
                  :src="(typeof post.covers[0] === 'string' ? post.covers[0] : post.covers[0]?.url) || ''"
                  :alt="post.title"
                  class="absolute inset-0 w-full h-full object-cover group-hover:scale-[1.03] transition-transform duration-300"
                  loading="lazy" >
                <!-- 多封面角标 -->
                <div
                  v-if="post.many_covers && post.covers.length > 1"
                  class="absolute top-2 right-2 z-10 flex items-center gap-1 px-2 py-1 rounded-md bg-black/60 text-white text-xs font-medium backdrop-blur-sm">
                  <Icon name="ri-gallery-line" class="size-3.5" />
                  <span>+{{ post.covers.length - 1 }}</span>
                </div>
                <!-- 关联地点角标 -->
                <div
                  v-if="post.travelCount > 0"
                  :class="post.many_covers && post.covers.length > 1 ? 'top-10' : 'top-2'"
                  class="absolute right-2 z-10 flex items-center gap-1 px-2 py-1 rounded-md bg-black/60 text-white text-xs font-medium backdrop-blur-sm">
                  <Icon name="ri:map-pin-line" class="size-3.5" />
                  <span>{{ post.travelCount }}</span>
                </div>
              </div>
              <!-- 无封面占位 -->
              <div v-else class="flex-1 bg-slate-100 dark:bg-gray-800 flex items-center justify-center">
                <span class="text-slate-400 dark:text-gray-500 text-4xl">{{ post.title[0] }}</span>
              </div>
              <!-- 文章信息（底部毛玻璃带） -->
              <div
                class="relative mt-auto w-full p-3"
                :class="post.covers && post.covers.length > 0 ? 'cover-backdrop text-white' : 'bg-white/95 dark:bg-gray-900/95 backdrop-blur-md'">
                <h3
                  class="font-medium text-sm line-clamp-2 mb-2 transition-colors"
                  :class="
                    post.covers && post.covers.length > 0
                      ? 'text-white hover:text-blue-100'
                      : 'text-slate-900 dark:text-white hover:text-blue-600 dark:hover:text-blue-400'
                  ">
                  {{ post.title }}
                </h3>
                <div
                  class="flex items-center gap-2 text-xs flex-wrap"
                  :class="post.covers && post.covers.length > 0 ? 'text-white/80' : 'text-slate-500 dark:text-gray-400'">
                  <div v-if="post.categories && post.categories.length > 0" class="flex items-center gap-0.5">
                    <Icon name="ri:menu-line" aria-hidden="true" class="size-3" />
                    <span
                      v-for="(cat, idx) in post.categories"
                      :key="cat.slug ?? cat.name"
                      v-tooltip="'分类'"
                      :class="post.covers && post.covers.length > 0 ? 'hover:text-blue-100' : 'hover:text-blue-600 dark:hover:text-blue-400'">
                      {{ cat.name }}<span v-if="idx < post.categories.length - 1">,</span>
                    </span>
                  </div>
                  <div v-if="post.tags && post.tags.length > 0" class="flex items-center gap-0.5">
                    <Icon name="ri:hashtag" aria-hidden="true" class="size-3" />
                    <span
                      v-for="(tag, idx) in post.tags.slice(0, 2)"
                      :key="tag.slug ?? tag.name"
                      v-tooltip="'标签'"
                      :class="post.covers && post.covers.length > 0 ? 'hover:text-blue-100' : 'hover:text-blue-600 dark:hover:text-blue-400'">
                      {{ tag.name }}<span v-if="idx < Math.min(post.tags.length, 2) - 1">,</span>
                    </span>
                    <span v-if="post.tags.length > 2">+{{ post.tags.length - 2 }}</span>
                  </div>
                  <span v-tooltip="'发布时间'" class="flex items-center gap-0.5">
                    <Icon name="ri:time-line" aria-hidden="true" class="size-3" />
                    {{ formatDate(post.created) }}
                  </span>
                  <span v-tooltip="'评论数量'" class="flex items-center gap-0.5">
                    <Icon name="ri:chat-2-line" aria-hidden="true" class="size-3" />
                    {{ post.commentsNum > 0 ? post.commentsNum : "暂无评论" }}
                  </span>
                </div>
              </div>
            </div>
          </NuxtLink>
        </div>

        <!-- 无文章状态 -->
        <div v-else class="text-center py-12 text-slate-500 dark:text-gray-400">
          <p>暂无文章</p>
        </div>
      </section>

      <!-- 分类文章 -->
      <section v-if="categoryRecentPosts.length > 0" v-scroll-reveal class="mx-auto max-w-275">
        <template v-for="(categoryData, index) in categoryRecentPosts" :key="categoryData.category.slug">
          <!-- 分类标题 -->
          <div class="flex items-center justify-between mb-6">
            <div>
              <h2 class="text-blue-700 dark:text-blue-500 text-sm">{{ categoryData.category.name }}</h2>
              <div class="text-slate-800 dark:text-white text-lg font-bold mt-1">{{ categoryData.category.desc }}</div>
            </div>
            <NuxtLink
              :to="`/category/${categoryData.category.slug}`"
              class="text-blue-600 dark:text-blue-400 hover:underline text-sm flex items-center gap-1">
              查看更多
              <Icon name="ri:arrow-right-line" aria-hidden="true" class="size-4" />
            </NuxtLink>
          </div>

          <!-- 文章网格 -->
          <div class="flex flex-wrap gap-4" :class="{ 'mb-12': index < categoryRecentPosts.length - 1 }">
            <NuxtLink
              v-for="post in categoryData.posts"
              :key="post.cid"
              :to="`/content/${categoryData.category.slug}/${post.slug || post.cid}`"
              :aria-label="`阅读文章：${post.title}`"
              class="block no-underline flex-[1_0_200px]">
              <div
                class="relative rounded-xl border border-slate-200 dark:border-gray-700 overflow-hidden hover:border-blue-500 dark:hover:border-blue-600 shadow-sm hover:shadow-md transition-all duration-300 h-55 flex flex-col">
                <!-- 封面占满整卡 -->
                <div v-if="post.covers && post.covers.length > 0" class="absolute inset-0">
                  <img
                    :src="(typeof post.covers[0] === 'string' ? post.covers[0] : post.covers[0]?.url) || ''"
                    :alt="post.title"
                    class="absolute inset-0 w-full h-full object-cover hover:scale-[1.03] transition-transform duration-300"
                    loading="lazy" >
                  <!-- 多封面角标 -->
                  <div
                    v-if="post.many_covers && post.covers.length > 1"
                    class="absolute top-2 right-2 z-10 flex items-center gap-1 px-2 py-1 rounded-md bg-black/60 text-white text-xs font-medium backdrop-blur-sm">
                    <Icon name="ri-gallery-line" class="size-3.5" />
                    <span>+{{ post.covers.length - 1 }}</span>
                  </div>
                  <!-- 关联地点角标 -->
                  <div
                    v-if="post.travelCount > 0"
                    :class="post.many_covers && post.covers.length > 1 ? 'top-10' : 'top-2'"
                    class="absolute right-2 z-10 flex items-center gap-1 px-2 py-1 rounded-md bg-black/60 text-white text-xs font-medium backdrop-blur-sm">
                    <Icon name="ri:map-pin-line" class="size-3.5" />
                    <span>{{ post.travelCount }}</span>
                  </div>
                </div>
                <!-- 无封面占位 -->
                <div v-else class="flex-1 bg-slate-100 dark:bg-gray-800 flex items-center justify-center">
                  <span class="text-slate-400 dark:text-gray-500 text-4xl">{{ post.title[0] }}</span>
                </div>
                <!-- 文章信息（底部毛玻璃带） -->
                <div
                  class="relative mt-auto w-full p-3"
                  :class="post.covers && post.covers.length > 0 ? 'cover-backdrop text-white' : 'bg-white/95 dark:bg-gray-900/95 backdrop-blur-md'">
                  <h3
                    class="font-medium text-sm line-clamp-2 mb-2 transition-colors"
                    :class="
                      post.covers && post.covers.length > 0
                        ? 'text-white hover:text-blue-100'
                        : 'text-slate-900 dark:text-white hover:text-blue-600 dark:hover:text-blue-400'
                    ">
                    {{ post.title }}
                  </h3>
                  <div
                    class="flex items-center gap-2 text-xs flex-wrap"
                    :class="post.covers && post.covers.length > 0 ? 'text-white/80' : 'text-slate-500 dark:text-gray-400'">
                    <span v-if="post.tags && post.tags.length > 0" class="flex items-center gap-0.5">
                      <Icon name="ri:hashtag" aria-hidden="true" class="size-3" />
                      <span
                        v-for="(tag, idx) in post.tags.slice(0, 2)"
                        :key="tag.slug ?? tag.name"
                        v-tooltip="'标签'"
                        :class="post.covers && post.covers.length > 0 ? 'hover:text-blue-100' : 'hover:text-blue-600 dark:hover:text-blue-400'">
                        {{ tag.name }}<span v-if="idx < Math.min(post.tags.length, 2) - 1">,</span>
                      </span>
                      <span v-if="post.tags.length > 2">+{{ post.tags.length - 2 }}</span>
                    </span>
                    <span v-tooltip="'发布时间'" class="flex items-center gap-0.5">
                      <Icon name="ri:time-line" aria-hidden="true" class="size-3" />
                      <span>{{ formatDate(post.created) }}</span>
                    </span>
                    <span v-tooltip="'评论数量'" class="flex items-center gap-0.5">
                      <Icon name="ri:chat-2-line" aria-hidden="true" class="size-3" />
                      <span>{{ post.commentsNum > 0 ? post.commentsNum : "暂无评论" }}</span>
                    </span>
                  </div>
                </div>
              </div>
            </NuxtLink>
          </div>
        </template>
      </section>

      <!-- 最新图片 -->
      <section
        v-if="photoImages.length > 0"
        ref="sectionPhotos"
        v-scroll-reveal
        class="mt-12 mx-auto max-w-275"
        aria-labelledby="index-photo-posts-title">
        <h2 id="index-photo-posts-title" class="text-blue-700 dark:text-blue-500 text-sm text-center">最新图片</h2>
        <div class="text-slate-800 dark:text-white text-[1.6em] font-bold my-1 text-center">最近发布的图片</div>
        <div class="text-slate-500 dark:text-gray-400 text-sm mb-8 text-center">小物件，风景，合照，值得记录的瞬间</div>

        <!-- 图片瀑布流 -->
        <WaterfallGrid :items="photoImages" />

        <!-- 查看更多 -->
        <div class="text-center mt-8 mb-36">
          <NuxtLink
            :to="`/category/${photoCategorySlug}`"
            class="inline-flex items-center gap-1 text-blue-600 dark:text-blue-400 hover:underline text-sm">
            查看全部图片
            <Icon name="ri:arrow-right-line" aria-hidden="true" class="size-4" />
          </NuxtLink>
        </div>
      </section>

      <!-- 目录 -->
      <div
        class="max-sm:hidden flex -mt-16 w-fit sticky bottom-2 border border-blue-400 dark:border-blue-180 bg-gray-50 shadow-xs dark:bg-slate-800 text-gray-700 dark:text-gray-100 rounded-full mx-auto text-sm dark:border-blue-700">
        <!-- 滑动指示框：跟随激活节点在 4 个目录项之间移动（节点等宽，故按槽位 25% 等分用 calc 定位 + 滑动） -->
        <!-- 四周内缩 + 微投影，呈内嵌药丸质感：上下 top-1/bottom-1，左右用 calc(left/width) 留出 4px 真实间隙；
             不用「透明 border + bg-clip-padding」方案，避免边框渲染出深色伪影 -->
        <div
          class="absolute top-1 bottom-1 rounded-full bg-blue-700 shadow-sm pointer-events-none"
          :style="{
            left: `calc(${activeTocIndex * 25}% + 4px)`,
            width: 'calc(25% - 8px)',
            transition: 'left 300ms cubic-bezier(0, 0, 0.2, 1)',
          }" />
        <div
          v-for="(item, index) in tocItems"
          :key="item.id"
          class="group relative z-10 px-4 py-2 cursor-pointer"
          :class="{ 'text-white': activeTocIndex === index }"
          @click="scrollToSection(index)">
          <!-- 非激活态悬浮背景：与高亮指示框同尺寸的内嵌药丸（inset-1 与指示框四周 4px 内缩一致） -->
          <span
            v-if="activeTocIndex !== index"
            class="absolute inset-1 rounded-full bg-gray-100 opacity-0 transition-opacity duration-150 group-hover:opacity-100 dark:bg-gray-700" />
          <span class="relative">{{ item.title }}</span>
        </div>
      </div>
    </div>
    <!-- 间隔 -->
    <div class="h-36" />

    <!-- 阅读更多 -->
    <section v-scroll-reveal class="mx-auto max-w-275" aria-labelledby="index-read-more-title">
      <h2 id="index-read-more-title" class="text-slate-800 dark:text-white text-[1.6em] font-bold text-center">阅读更多</h2>
      <div class="flex flex-wrap justify-center gap-4 mt-8">
        <NuxtLink
          to="/subscribes"
          class="px-6 py-2.5 bg-slate-100 dark:bg-gray-800 hover:bg-slate-200 dark:hover:bg-gray-700 rounded-lg text-slate-700 dark:text-gray-200 transition-colors">
          我的订阅</NuxtLink
        >
        <NuxtLink
          href="/agreement"
          class="px-6 py-2.5 bg-slate-100 dark:bg-gray-800 hover:bg-slate-200 dark:hover:bg-gray-700 rounded-lg text-slate-700 dark:text-gray-200 transition-colors">
          协议</NuxtLink
        >
        <NuxtLink
          href="/sitemap"
          class="px-6 py-2.5 bg-slate-100 dark:bg-gray-800 hover:bg-slate-200 dark:hover:bg-gray-700 rounded-lg text-slate-700 dark:text-gray-200 transition-colors">
          站点地图</NuxtLink
        >
        <NuxtLink
          href="/archiving"
          class="px-6 py-2.5 bg-slate-100 dark:bg-gray-800 hover:bg-slate-200 dark:hover:bg-gray-700 rounded-lg text-slate-700 dark:text-gray-200 transition-colors">
          归档</NuxtLink
        >
        <NuxtLink
          to="/changelogs"
          class="px-6 py-2.5 bg-slate-100 dark:bg-gray-800 hover:bg-slate-200 dark:hover:bg-gray-700 rounded-lg text-slate-700 dark:text-gray-200 transition-colors">
          更新日志</NuxtLink
        >
        <NuxtLink
          to="/feed"
          target="_blank"
          class="px-6 py-2.5 bg-slate-100 dark:bg-gray-800 hover:bg-slate-200 dark:hover:bg-gray-700 rounded-lg text-slate-700 dark:text-gray-200 transition-colors">
          订阅本站</NuxtLink
        >
      </div>
    </section>

    <!-- 间隔 -->
    <div class="h-37.5" />

    <!-- 订阅文章 -->
    <section v-if="subscribePosts.length > 0" v-scroll-reveal class="mx-auto max-w-275" aria-labelledby="index-subscribe-posts-title">
      <div class="flex items-center justify-between mb-6">
        <div class="flex gap-6 max-sm:flex-col max-sm:gap-1">
          <div>
            <h2 id="index-subscribe-posts-title" class="text-blue-700 dark:text-blue-500 text-sm">订阅文章</h2>
            <div class="text-slate-800 dark:text-white text-lg font-bold mt-1">来自订阅源的最新内容</div>
          </div>
          <MapEntryLinks :views="['blogs']" title="查看这些站点位于哪里" class="self-end" />
        </div>
        <NuxtLink to="/subscribes" class="text-blue-600 dark:text-blue-400 hover:underline text-sm flex items-center gap-1">
          查看更多
          <Icon name="ri:arrow-right-line" aria-hidden="true" class="size-4" />
        </NuxtLink>
      </div>

      <!-- 文章列表 -->
      <div class="space-y-4">
        <a
          v-for="post in subscribePosts"
          :key="post.id"
          :href="post.link"
          target="_blank"
          rel="noopener noreferrer"
          class="block border rounded-lg p-4 hover:shadow-sm hover:border-blue-500 dark:hover:border-blue-600 transition-all no-underline group">
          <div class="flex items-start gap-3">
            <!-- 订阅源头像 -->
            <Avatar class="size-10 shrink-0">
              <AvatarImage v-if="post.subscribeAvatar" :src="post.subscribeAvatar" :alt="post.subscribeName" />
              <AvatarFallback>{{ post.subscribeName?.charAt(0) || "?" }}</AvatarFallback>
            </Avatar>

            <!-- 文章内容 -->
            <div class="flex-1 min-w-0">
              <div class="flex items-center gap-2 mb-1">
                <span class="text-sm text-muted-foreground">{{ post.subscribeName }}</span>
                <span v-if="post.pubDate" class="text-xs text-muted-foreground">
                  {{ formatDate(post.pubDate) }}
                </span>
              </div>
              <h3 class="text-base font-semibold text-foreground group-hover:text-primary transition-colors line-clamp-2">
                {{ post.title }}
              </h3>
              <p v-if="post.description" class="text-sm text-muted-foreground mt-1 line-clamp-2">
                {{ post.description }}
              </p>
            </div>

            <!-- 外部链接图标 -->
            <Icon
              name="lucide:external-link"
              aria-hidden="true"
              class="size-5 shrink-0 text-muted-foreground group-hover:text-primary transition-colors" />
          </div>
        </a>
      </div>
    </section>

    <!-- 间隔 -->
    <div v-if="subscribePosts.length > 0" class="h-37.5" />

    <!-- 更新日志 -->
    <section v-if="recentChangelogs.length > 0" v-scroll-reveal class="mx-auto max-w-275" aria-labelledby="index-changelogs-title">
      <div class="flex items-center justify-between mb-6">
        <div>
          <h2 id="index-changelogs-title" class="text-blue-700 dark:text-blue-500 text-sm">更新日志</h2>
          <div class="text-slate-800 dark:text-white text-lg font-bold mt-1">站点最新更新</div>
        </div>
        <NuxtLink to="/changelogs" class="text-blue-600 dark:text-blue-400 hover:underline text-sm flex items-center gap-1">
          查看更多
          <Icon name="ri:arrow-right-line" aria-hidden="true" class="size-4" />
        </NuxtLink>
      </div>

      <!-- 日志列表 -->
      <div class="space-y-4">
        <div
          v-for="log in recentChangelogs"
          :key="log.id"
          class="border rounded-lg p-4 hover:shadow-sm hover:border-blue-500 dark:hover:border-blue-600 transition-all">
          <div class="mb-2">
            <span class="text-sm text-muted-foreground">{{ formatChangelogDate(log.create_time) }}</span>
          </div>
          <div class="space-y-2">
            <div v-for="(entry, i) in log.content" :key="i" class="flex items-start gap-3">
              <!-- 类型徽标 -->
              <div :class="`px-3 py-1 rounded-full text-xs font-medium shrink-0 flex items-center gap-1 ${getChangelogMeta(entry.type).color}`">
                <Icon :name="getChangelogMeta(entry.type).icon" class="size-3" />
                {{ getChangelogMeta(entry.type).label }}
              </div>

              <!-- 条目内容 -->
              <div
                class="prose prose-slate dark:prose-invert max-w-none prose-p:text-sm prose-p:leading-relaxed markdown-content flex-1 min-w-0"
                v-html="entry.html" />
            </div>
          </div>
        </div>
      </div>
    </section>

    <!-- 底部间隔 -->
    <div class="h-37.5" />
  </div>
</template>

<script setup lang="ts">
import { type ComponentPublicInstance, onMounted, ref, shallowRef } from "vue";
import { useDebounceFn, useEventListener } from "@vueuse/core";

import MetingPlayer from "~/components/MetingPlayer.vue";
import type { GridItem } from "~/types/apis";
import { getChangelogMeta } from "~~/shared/changelog";
import { siteConfig } from "~~/site.config";

// 目录导航数据
const tocItems = [
  { id: "framework", title: "网站架构" },
  { id: "style", title: "样式选择" },
  { id: "content", title: "最新内容" },
  { id: "photos", title: "最新图片" },
];

// 当前激活的目录项索引
const activeTocIndex = ref(0);

// 4 个 section 的文档相对 offsetTop 缓存（rect.top + scrollY，而非每帧随滚动变的 rect.top）
// 样式选项 item 的文档相对 top + height 缓存（同理），供 computeStyleItems 复用
// null 表示需重算；在 resize / 字体加载 / 兜底定时器时统一失效
let tocOffsets: number[] | null = null;
let styleItemMetrics: { top: number; height: number }[] | null = null;
const invalidateOffsets = () => {
  tocOffsets = null;
  styleItemMetrics = null;
};

// Section refs
const sectionFramework = ref<HTMLElement | null>(null);
const sectionStyle = ref<HTMLElement | null>(null);
const sectionContent = ref<HTMLElement | null>(null);
const sectionPhotos = ref<HTMLElement | null>(null);

// 导航栏高度
const NAV_HEIGHT = 80;

// 滚动到指定 section
const scrollToSection = (index: number) => {
  const sections = [sectionFramework.value, sectionStyle.value, sectionContent.value, sectionPhotos.value];
  const targetSection = sections[index];

  if (!targetSection) return;

  const rect = targetSection.getBoundingClientRect();
  const scrollTop = window.scrollY + rect.top - NAV_HEIGHT;

  window.scrollTo({
    top: scrollTop,
    behavior: "smooth",
  });
};

// 计算目录高亮（统一 rAF tick 内调用；用缓存 offsetTop 避免每帧 getBoundingClientRect）
const computeToc = (scrollY: number, windowHeight: number) => {
  if (tocOffsets === null) {
    const sections = [sectionFramework.value, sectionStyle.value, sectionContent.value, sectionPhotos.value];
    tocOffsets = sections.map(el => (el ? el.getBoundingClientRect().top + window.scrollY : 0));
  }
  const offsets = tocOffsets;
  // 当 section 顶部在视口上方 1/3 处时激活
  offsets.forEach((offsetTop, index) => {
    if (scrollY >= offsetTop - windowHeight / 3 - NAV_HEIGHT) {
      activeTocIndex.value = index;
    }
  });
};

// 优化：使用聚合API一次性获取所有首页数据
const { data: homeData } = await useFetch("/api/home-data", {
  headers: {
    "x-ssr-internal-request": "true",
  },
});

// 站点信息
const { siteSettings } = useSiteSettings();
const siteName = computed(() => siteSettings.value?.siteName || siteConfig.siteName);

// 分类信息
const categories = computed(() => homeData.value?.data?.categories || []);

// 随机文章 - 仅客户端非阻塞加载：模板在 ClientOnly 内，SSR 拿到也不显示，
// 去掉顶层 await 解除首屏阻塞；server:false 不在 SSR 发请求，lazy:true 在 hydration 后异步发起
const { data: randomPostData } = useFetch("/api/random-post", {
  server: false,
  lazy: true,
  headers: {
    "x-ssr-internal-request": "true",
  },
});
const randomPost = computed(() => randomPostData.value?.data);

// 最新文章
const recentPosts = computed(() => homeData.value?.data?.recentPosts || []);

// 图片文章
const photoPosts = computed(() => homeData.value?.data?.photoPosts || []);

// 分类文章
const categoryRecentPosts = computed(() => homeData.value?.data?.categoryRecentPosts || []);

// 订阅文章
const subscribePosts = computed(() => homeData.value?.data?.subscribePosts || []);

// 更新日志
const recentChangelogs = computed(() => homeData.value?.data?.changelogs || []);

// 展示的图片列表（所有文章的封面展开）
const photoImages = computed(() => {
  const images: { url: string; desc?: string; width?: number | null; height?: number | null; title: string; slug: string; cid: number; categorySlug?: string }[] = [];
  photoPosts.value.forEach(post => {
    if (post.covers && post.covers.length > 0) {
      post.covers.forEach(cover => {
        images.push({
          url: cover.url || (typeof cover === "string" ? cover : ""),
          desc: cover.desc,
          width: cover.width,
          height: cover.height,
          title: post.title,
          slug: post.slug ?? "",
          cid: post.cid,
          categorySlug: post.categories?.[0]?.slug ?? undefined,
        });
      });
    }
  });
  return images;
});

// 是否已完成客户端 hydration
// SSR 与客户端首帧都为 false，此时日期统一用绝对格式（不依赖当前时间），
// 避免 ISR 缓存导致的 hydration text content mismatch；onMounted 后切换为相对时间
const isHydrated = ref(false);

// 格式化为绝对日期（SSR 与客户端一致，不依赖当前时间）
function formatAbsoluteDate(date: string | Date): string {
  const d = typeof date === "string" ? new Date(date) : date;
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

// 格式化日期：hydration 完成前返回绝对日期，完成后返回相对时间
function formatDate(date: string | Date): string {
  const d = typeof date === "string" ? new Date(date) : date;
  if (!isHydrated.value) {
    return formatAbsoluteDate(d);
  }
  const now = new Date();
  const diff = now.getTime() - d.getTime();
  const seconds = Math.floor(diff / 1000);
  const minutes = Math.floor(seconds / 60);
  const hours = Math.floor(minutes / 60);
  const days = Math.floor(hours / 24);
  const weeks = Math.floor(days / 7);
  const months = Math.floor(days / 30);
  const years = Math.floor(days / 365);

  if (years > 0) return `${years}年前`;
  if (months > 0) return `${months}个月前`;
  if (weeks > 0) return `${weeks}周前`;
  if (days > 0) return `${days}天前`;
  if (hours > 0) return `${hours}小时前`;
  if (minutes > 0) return `${minutes}分钟前`;
  return "刚刚";
}

// 格式化更新日志日期：hydration 前用确定性格式，避免 Node 与浏览器 ICU 数据差异
function formatChangelogDate(date: string | Date): string {
  const d = typeof date === "string" ? new Date(date) : date;
  if (!isHydrated.value) {
    return formatAbsoluteDate(d);
  }
  return d.toLocaleDateString("zh-CN", {
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  });
}

// 页面元数据
usePageSeo({
  title: siteName,
  description: siteConfig.pageSeo.home.description,
  keywords: siteConfig.pageSeo.home.keywords,
});

// 首页Hero下文字
const homeAnnounce = computed(() => siteSettings.value?.homeCustomText || siteConfig.homeCustomText);

// 图片分类slug
const photoCategorySlug = computed(() => homeData.value?.data?.site?.photoCategorySlug || "shot");

// 联系链接配置
const contactLinks = ref(siteConfig.social);

const themeItems = computed(() => [
  {
    title: "字体选择",
    type: "grid",
    grids: [
      { text: "主要字体" },
      { text: "思源宋体", isLink: true, href: "https://fonts.google.com/noto/specimen/Noto+Serif+SC" },
      { text: "代码字体" },
      { text: "JetBrains Mono", isCode: true },
      { text: "图标" },
      { text: "Remixicon", hasIcon: true },
    ] as GridItem[],
  },
  {
    title: "调整布局",
    type: "content",
    content: "适当采用圆角、阴影、遮罩、背景，添加动画、交互，让页面尽量简洁的同时不牺牲用户体验。",
  },
  {
    title: "用小组件丰富文章内容",
    type: "grid",
    grids: [
      { text: "音乐播放器" },
      { text: "视频播放器" },
      { text: "代码块" },
      { text: "TIP 组件" },
      { text: "轮播图" },
      { text: "..." },
    ] as GridItem[],
  },
  {
    title: "用文章的方式记录生活",
    type: "grid",
    grids:
      categories.value.length > 0
        ? categories.value.flatMap(cat => [
            { text: cat.name, href: `/category/${cat.slug}` },
            { text: cat.desc || "暂无描述", isCategory: true },
          ])
        : [{ text: "暂无分类" }, { text: "", isCategory: true }],
  } as { title: string; type: string; grids: GridItem[] },
]);

const themeRightItems = [{ type: "fonts" }, { type: "layout", image: "/imgs/shenyang.webp" }, { type: "music" }, { type: "article" }];

// 当前激活的样式索引
const activeThemeIndex = ref(0);

// 样式选项元素的ref数组 - 使用Set去重
const themeItemRefsSet = new Set<HTMLElement>();
const themeItemRefs = ref<HTMLElement[]>([]);

const setThemeItemRef = (el: Element | ComponentPublicInstance | null) => {
  if (el) {
    themeItemRefsSet.add(el as HTMLElement);
    themeItemRefs.value = Array.from(themeItemRefsSet);
  }
};

// 计算样式选择区跟随（统一 rAF tick 内调用；缓存 doc 相对 top+height，每帧纯算术：
// itemCenter = docTop − scrollY + height/2，与 rect.top + rect.height/2 恒等。
// 语义是"最接近视口中心"而非"是否可见"，故仍用滚动 tick 而非 IntersectionObserver）
const computeStyleItems = (scrollY: number, viewportCenter: number) => {
  const refs = themeItemRefs.value;
  if (!refs || refs.length === 0) return;

  // 缓存失效：外部 invalidate，或 refs 数量变化（homeData 刷新导致 item 增减）
  if (styleItemMetrics === null || styleItemMetrics.length !== refs.length) {
    styleItemMetrics = refs.map(el => {
      if (!el) return { top: 0, height: 0 };
      const rect = el.getBoundingClientRect();
      return { top: rect.top + scrollY, height: rect.height };
    });
  }
  const metrics = styleItemMetrics;

  let closestIndex = 0;
  let closestDistance = Infinity;

  for (let index = 0; index < metrics.length; index++) {
    const m = metrics[index];
    if (!m) continue;
    const itemCenter = m.top - scrollY + m.height / 2;
    const distance = Math.abs(itemCenter - viewportCenter);
    if (distance < closestDistance) {
      closestDistance = distance;
      closestIndex = index;
    }
  }

  if (closestIndex !== activeThemeIndex.value) {
    activeThemeIndex.value = closestIndex;
  }
};

// 英雄区引用和样式（shallowRef：仅整体替换触发响应，避免深属性追踪开销）
const heroRef = ref<HTMLElement | null>(null);
const heroStyle = shallowRef<Record<string, string>>({
  transform: "scale(1)",
  opacity: "1",
  display: "flex",
});
// hero 是否处于可见态（已 display:none 后置 false，早退跳过全部计算）
let heroVisible = true;

// 计算英雄区缩放/淡出样式（统一 rAF tick 内调用；已隐藏后早退，值未变时跳过赋值）
const computeHero = (scrollTop: number, windowHeight: number) => {
  if (!heroRef.value) return;
  const maxOffset = windowHeight - 500;
  const offset = Math.min(scrollTop, maxOffset);
  const scale = 1 - (offset / maxOffset) * 0.2;
  const opacity = 1 - offset / maxOffset;

  // 超过阈值 → 隐藏态：仅首次切换时赋值，之后早退
  if (scrollTop > windowHeight - 200) {
    if (!heroVisible) return;
    heroStyle.value = {
      transform: `scale(${Math.max(scale, 0)})`,
      opacity: "0",
      display: "none",
      pointerEvents: "none",
    };
    heroVisible = false;
    return;
  }

  // 可见态：值未变时跳过赋值，避免无意义的 :style patch
  const transform = `scale(${Math.max(scale, 0)})`;
  const opacityStr = Math.max(opacity, 0).toString();
  const prev = heroStyle.value;
  if (heroVisible && prev.transform === transform && prev.opacity === opacityStr && prev.display === "flex") {
    return;
  }
  heroStyle.value = {
    transform,
    opacity: opacityStr,
    display: "flex",
    pointerEvents: "auto",
  };
  heroVisible = true;
};

// 统一 rAF 调度：scroll 事件置 dirty flag，每帧最多跑一次 tick，
// 集中读取 DOM 避免读写交错导致的 layout thrashing
let scrollRafPending = false;
const onScroll = () => {
  if (scrollRafPending) return;
  scrollRafPending = true;
  requestAnimationFrame(() => {
    const scrollTop = window.scrollY;
    const windowHeight = window.innerHeight;
    computeHero(scrollTop, windowHeight);
    computeToc(scrollTop, windowHeight);
    computeStyleItems(scrollTop, windowHeight / 2);
    scrollRafPending = false;
  });
};

// 初始化
onMounted(() => {
  // 标记 hydration 已完成，此后日期切换为相对时间 / 本地化格式
  isHydrated.value = true;

  // 首帧同步跑一次（无需 rAF），确保页面加载时状态正确
  const scrollTop = window.scrollY;
  const windowHeight = window.innerHeight;
  computeHero(scrollTop, windowHeight);
  computeToc(scrollTop, windowHeight);
  computeStyleItems(scrollTop, windowHeight / 2);

  // 唯一 scroll 监听（passive：handler 不调 preventDefault，允许浏览器并行滚动）
  useEventListener(window, "scroll", onScroll, { passive: true });

  // offsetTop 缓存失效：resize（防抖）+ 字体加载 + 兜底定时器
  useEventListener(window, "resize", useDebounceFn(invalidateOffsets, 200), { passive: true });
  if (document.fonts) {
    document.fonts.ready.then(invalidateOffsets);
  }
  // 兜底：覆盖未捕获的 layout 变化（如延迟加载的资源改变 section 高度）
  setTimeout(invalidateOffsets, 3000);
});
</script>

<style scoped>
/* 浮动动画 */
@keyframes float {
  0%,
  100% {
    transform: translateY(0);
  }

  50% {
    transform: translateY(-10px);
  }
}

.animate-float {
  animation: float 3s ease-in-out infinite;
}

.animate-float-delay-1 {
  animation: float 3s ease-in-out infinite;
  animation-delay: 0.5s;
}

.animate-float-delay-2 {
  animation: float 3s ease-in-out infinite;
  animation-delay: 1s;
}

/* Markdown内容样式 */
.markdown-content :deep(strong) {
  font-weight: 700;
  color: rgb(15 23 42);
}

.markdown-content :deep(em) {
  font-style: italic;
}

.markdown-content :deep(s) {
  text-decoration: line-through;
  color: rgb(100 116 139);
}

.markdown-content :deep(code) {
  background-color: rgb(241 245 249);
  color: rgb(15 23 42);
  padding: 0.125rem 0.375rem;
  border-radius: 0.25rem;
  font-size: 0.875em;
  font-family:
    JetBrains Mono,
    monospace;
}

.markdown-content :deep(ul) {
  padding-left: 1.5em;
  list-style-type: disc;
}

.markdown-content :deep(ol) {
  padding-left: 1.5em;
  list-style-type: decimal;
}

.markdown-content :deep(li) {
  line-height: 1.6;
}

.markdown-content :deep(ul ul),
.markdown-content :deep(ol ul) {
  list-style-type: circle;
}

.markdown-content :deep(ul ul ul),
.markdown-content :deep(ol ul ul) {
  list-style-type: square;
}

.markdown-content :deep(ol ol ol) {
  list-style-type: lower-roman;
}

/* 深色模式 Markdown 样式 */
.dark .markdown-content :deep(strong) {
  color: rgb(255 255 255);
}

.dark .markdown-content :deep(s) {
  color: rgb(148 163 184);
}

.dark .markdown-content :deep(code) {
  background-color: rgb(30 41 59);
  color: rgb(255 255 255);
}
</style>
