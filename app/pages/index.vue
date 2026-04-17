<template>
  <div class="index-box min-h-screen relative w-full bg-white dark:bg-[#0a0a0a]">
    <!-- 英雄区 - fixed定位，独立于section -->
    <h1 id="index-hero-title" class="sr-only">欢迎来到 ImQi1</h1>
    <div
      ref="heroRef"
      class="index-hero fixed inset-0 flex flex-col items-center justify-center max-w-250 w-[90vw] mx-auto left-0 right-0"
      :style="heroStyle">
      <div class="index-hero-box flex items-center justify-between w-full opacity-0 animate-fade-in">
        <!-- 标题区域 -->
        <div class="index-hero-title p-1.5">
          <h1 class="index-first-line text-slate-900 dark:text-white text-[6em] font-black leading-none">
            IM<span class="text-red-600 dark:text-red-500">QI1</span>.COM
          </h1>
          <div class="index-second-line mt-4 text-slate-600 dark:text-gray-400 text-base" v-html="homeAnnounce"></div>
        </div>

        <!-- 头像区域 -->
        <div class="index-avatar-box h-fit max-md:hidden">
          <img src="/imgs/avatar.webp" alt="头像" class="index-avatar rounded-full max-w-50 w-50 h-50 object-cover" />
        </div>

        <!-- 滚动提示 -->
        <div class="index-scroll absolute -bottom-20 left-1/2 -translate-x-1/2 text-gray-600 dark:text-gray-500 animate-bounce max-md:-bottom-20">
          <Icon name="ri:mouse-line" class="size-4" />
        </div>
      </div>

      <!-- 联系链接 -->
      <ClientOnly>
        <div class="index-contact flex mt-3 self-start max-md:mx-auto animate-fade-in">
          <template v-for="link in contactLinks" :key="link.name">
            <NuxtLink
              :href="link.url"
              :target="link.target ? '_blank' : undefined"
              v-tooltip="link.title"
              class="index-contact-link group relative flex items-center justify-center w-9 h-9 rounded-md transition-all duration-200 text-gray-500 dark:text-gray-400 hover:bg-slate-100 dark:hover:bg-gray-800 hover:text-slate-900 dark:hover:text-white">
              <Icon :name="link.icon" class="size-5" mode="svg" />
            </NuxtLink>
          </template>
        </div>
      </ClientOnly>
    </div>

    <!-- 占位section，用于撑开页面高度 -->
    <section class="h-[calc(100vh-250px)] mb-62.5" aria-hidden="true"></section>

    <!-- 为什么要做这个网站 -->
    <section class="index-about-this mx-auto max-w-275 animate-fade-in" aria-labelledby="index-why-title">
      <h2 id="index-why-title" class="index-why-this text-slate-500 dark:text-gray-400 text-sm">？ 为什么要做这个网站</h2>
      <div class="index-why-reason tracking-[0.1ch] leading-[1.7em] mt-2.5 max-w-187.5">
        <p class="my-2.5 text-slate-700 dark:text-gray-300">
          起初建站只是一时兴起，和大多数人一样，我只是想记录下自己学习编程的心路历程和笔记，供自己以后有个参考。刚开始我以为有一个自己的网站是一个小众爱好，直到后来我才发现网络上有很多对此感兴趣的伙伴，于是我开始和他们保持联系。随着时间的增长，我对软件开发有了更浓厚的兴趣，我开始和同学、朋友交流，也有了自己独立开发的想法。在这之前我曾换过多个框架、主题，最终还是觉得自己开发一个主题最有成就感，也最能证明自己真正地学到了东西，所以你能在这里看到这些文字，也能看到我在此记录的其他内容。
        </p>
        <p class="my-2.5 text-slate-700 dark:text-gray-300">我喜欢游山玩水，有自己的爱好，活动。我觉得一切有趣的事情，都会在此记录。</p>
      </div>
    </section>

    <!-- 间隔 -->
    <div class="h-37.5"></div>

    <!-- 四个内容的父盒子 -->
    <div class="index-content-box">
      <!-- 网站架构 -->
      <section ref="sectionFramework" class="index-website-framework animate-fade-in" aria-labelledby="index-framework-title">
        <div class="index-website-framework-content max-w-fit w-full mx-auto">
          <div class="index-framework-title mb-10">
            <h2 id="index-framework-title" class="index-theme-title1 text-blue-700 dark:text-blue-500 text-sm">网站架构</h2>
            <div class="index-theme-title2 text-slate-800 dark:text-white text-[1.6em] font-bold my-1">高开发效率 + 类型安全 + 全栈统一</div>
            <div class="index-theme-title3 text-slate-500 dark:text-gray-400 text-sm inline">
              <p>Nuxt4 为本站提供了快速、简单、可维护的网站架构</p>
            </div>
            <div class="index-theme-title3 text-slate-500 dark:text-gray-400 text-sm inline">
              <p>Prisma 提供了类型安全的数据库操作，确保数据的一致性和完整性</p>
            </div>
          </div>
          <div class="index-website-framework-box flex items-center justify-center gap-8 flex-wrap max-md:flex-col">
            <div class="index-framework-item flex flex-col relative">
              <Icon name="devicon:nuxtjs-wordmark" mode="svg" class="index-framework-pic size-25" />
            </div>
            <div class="index-framework-arrow max-md:mt-7">
              <Icon name="ri:add-large-line" class="text-2xl text-slate-400 dark:text-gray-500" />
            </div>
            <div class="index-framework-item flex flex-col relative">
              <Icon name="devicon:prisma-wordmark" mode="svg" class="index-framework-pic size-25" />
            </div>
            <div class="index-framework-arrow max-md:mt-7">
              <Icon name="ri:add-large-line" class="text-2xl text-slate-400 dark:text-gray-500" />
            </div>
            <div class="index-framework-item flex flex-col relative">
              <Icon name="logos:mysql" mode="svg" class="index-framework-pic size-25" />
            </div>
          </div>
          <div class="index-framework-introduction mt-20 font-medium max-w-200 mx-auto text-center text-slate-600 dark:text-gray-300 leading-relaxed">
            本站主题为 Glass，是我制作的第二款主题，从 2026 年 4 月开始制作，到现在仍持续更新中。这一版主题前后端采用 Nuxt4 搭建，配合
            Tailwindcss，构建了现代化的响应式布局，同时集成了 APlayer 音乐播放器、Fancy Apps
            图片灯箱等富媒体组件，为文章内容提供更丰富的交互体验。整个系统支持完整的博客功能，并具备完善的后台管理系统，实现了真正意义上的全栈内容管理系统。
          </div>
        </div>
      </section>

      <!-- 大间隔 -->
      <div class="h-62.5"></div>

      <!-- 样式选择 -->
      <div ref="sectionStyle" class="index-theme -mt-5 mx-auto max-w-200 animate-fade-in">
        <div class="index-theme-inner">
          <div class="index-theme-themes mb-30 max-md:text-center">
            <h2 class="index-theme-title1 text-blue-700 dark:text-blue-500 text-sm">样式选择</h2>
            <div class="index-theme-title2 text-slate-800 dark:text-white text-[1.6em] font-bold my-1">保持界面清爽，同时不牺牲功能丰富度</div>
            <div class="index-theme-title3 text-slate-500 dark:text-gray-400 text-sm">选择字体类型，合理规划布局，注意颜色搭配，添加边框圆角。</div>
          </div>
          <div class="index-theme-introduction flex max-md:justify-center">
            <!-- 左侧选项 -->
            <div class="index-theme-left flex flex-col gap-12.5">
              <div
                v-for="(item, index) in themeItems"
                :key="index"
                :ref="setThemeItemRef"
                class="index-theme-item flex flex-col items-start justify-center h-75 max-w-75">
                <div class="index-theme-title3 text-slate-500 dark:text-gray-400 text-sm">{{ item.title }}</div>
                <div v-if="item.type === 'grid'" class="index-theme-content grid grid-cols-[auto_1fr] gap-x-4 gap-y-1.5 mt-2.5 max-w-75">
                  <template v-for="(grid, gIndex) in item.grids" :key="gIndex">
                    <div v-if="grid.isLink" class="index-theme-grid">
                      <a :href="grid.href" class="hover:underline text-blue-600 dark:text-blue-400 font-weight" target="_blank">{{ grid.text }}</a>
                    </div>
                    <div v-else-if="grid.isCode" class="index-theme-grid">
                      <code class="bg-slate-100 dark:bg-gray-800 px-1 rounded text-sm text-slate-800 dark:text-gray-200">{{ grid.text }}</code>
                    </div>
                    <div v-else-if="grid.hasIcon" class="index-theme-grid flex items-center gap-1 text-slate-700 dark:text-gray-300">
                      {{ grid.text }}
                    </div>
                    <div v-else-if="grid.isCategory" class="index-theme-grid text-slate-800 dark:text-gray-200">
                      {{ grid.text }}
                    </div>
                    <NuxtLink v-else-if="grid.href" :to="grid.href" class="index-theme-grid hover:underline text-blue-600 dark:text-blue-400">
                      {{ grid.text }}
                    </NuxtLink>
                    <div v-else class="index-theme-grid text-slate-700 dark:text-gray-300">{{ grid.text }}</div>
                  </template>
                </div>
                <div v-else class="index-theme-content2 tracking-[0.1ch] mt-5 text-slate-700 dark:text-gray-300">
                  {{ item.content }}
                </div>
              </div>
            </div>

            <!-- 右侧展示 -->
            <div class="index-theme-right flex-1 flex justify-end relative max-md:hidden">
              <div class="index-theme-right-items flex items-center justify-center w-full h-0 sticky top-1/2 my-38">
                <div
                  v-for="(rightItem, index) in themeRightItems"
                  :key="index"
                  class="index-theme-right-item h-75 opacity-0 invisible absolute transition-opacity duration-300"
                  :class="{ 'opacity-100 pointer-events-auto visible': activeThemeIndex === index }">
                  <!-- 字体展示 -->
                  <div v-if="rightItem.type === 'fonts'" class="index-theme-box relative h-75 w-75">
                    <div
                      class="index-theme-serif grid grid-cols-2 grid-rows-2 place-items-center justify-items-center text-[2.5em] font-bold border border-slate-200 dark:border-gray-700 bg-white dark:bg-gray-900 rounded-xl shadow-sm h-38 w-38 absolute left-28 top-19 animate-float text-slate-900 dark:text-white">
                      <span>之</span>
                      <span>的</span>
                      <span>事</span>
                      <span>以</span>
                    </div>
                    <code
                      class="index-theme-mono bg-slate-50 dark:bg-gray-800 border border-slate-200 dark:border-gray-700 rounded shadow-sm px-2 py-1 absolute left-2.5 bottom-14 animate-float-delay-1 text-slate-800 dark:text-gray-200">
                      <span class="text-blue-700 dark:text-blue-400">print</span>(<span class="text-green-700 dark:text-green-400">"Hello World"</span
                      >)
                    </code>
                    <div
                      class="index-theme-icon grid grid-cols-2 grid-rows-2 place-items-center justify-items-center text-xl bg-slate-50 dark:bg-gray-800 border border-slate-200 dark:border-gray-700 rounded shadow-sm h-19 w-19 absolute left-14 top-8 animate-float-delay-2">
                      <span><Icon name="ri:attachment-line" class="text-slate-600 dark:text-gray-400" /></span>
                      <span><Icon name="ri:file-zip-fill" class="text-slate-600 dark:text-gray-400" /></span>
                      <span><Icon name="ri:video-fill" class="text-slate-600 dark:text-gray-400" /></span>
                      <span><Icon name="ri:restart-line" class="text-slate-600 dark:text-gray-400" /></span>
                    </div>
                  </div>

                  <!-- 布局图片 -->
                  <div v-else-if="rightItem.type === 'layout'" class="index-theme-box relative h-75 w-75 group">
                    <div
                      class="index-theme-img absolute top-6 left-6 w-50 h-50 rounded-xl shadow-sm bg-cover bg-center border border-slate-200 dark:border-gray-700 bg-white dark:bg-gray-900 overflow-hidden group-hover:-translate-x-1 duration-200">
                      <img src="/imgs/shenyang.webp" class="absolute inset-0 aspect-square object-cover" alt="沈阳站" />
                    </div>
                    <div
                      class="index-theme-border absolute top-31 left-36 w-38 h-38 bg-slate-100 dark:bg-gray-800 rounded-xl border border-slate-200 dark:border-gray-700 transition-transform group-hover:translate-x-1 duration-200 shadow-sm"></div>
                  </div>

                  <!-- 音乐播放器 - 延迟加载 -->
                  <div v-else-if="rightItem.type === 'music'" class="index-theme-box relative h-75 w-75 flex items-center justify-center">
                    <ClientOnly>
                      <div class="index-theme-music-box absolute top-1/2 -left-24 -right-15 -translate-y-1/2">
                        <MetingPlayer server="netease" type="song" id="2142943893" :listFolded="false" :mutex="true" />
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
                    <div v-if="rightItem.type === 'article'" class="index-theme-box relative h-75 w-75 flex items-center justify-center">
                      <div v-if="randomPost" class="index-theme-article-box flex flex-col w-full h-full justify-center">
                        <!-- 封面 -->
                        <div
                          v-if="randomPost.covers && randomPost.covers.length > 0"
                          class="mb-3 rounded-lg overflow-hidden h-40 border-px border-solid border-slate-200 dark:border-gray-700">
                          <img
                            :src="randomPost.covers[0].url || randomPost.covers[0]"
                            :alt="randomPost.title"
                            class="w-full h-full object-cover"
                            loading="lazy" />
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
                      <div v-else class="index-theme-article-box flex flex-col items-center justify-center h-full w-full">
                        <div class="text-slate-500 dark:text-gray-400 text-sm">暂无文章</div>
                      </div>
                    </div>
                    <template #fallback>
                      <div class="index-theme-box relative h-75 w-75 flex items-center justify-center">
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
      <div class="h-62.5"></div>

      <!-- 最新文章 -->
      <section ref="sectionContent" class="index-recent-posts mx-auto max-w-275 animate-fade-in" aria-labelledby="index-recent-posts-title">
        <h2 id="index-recent-posts-title" class="index-theme-title1 text-blue-700 dark:text-blue-500 text-sm">文章内容</h2>
        <div class="index-theme-title2 text-slate-800 dark:text-white text-[1.6em] font-bold my-1">最新发布的内容</div>
        <div class="index-theme-title3 text-slate-500 dark:text-gray-400 text-sm mb-8">生活中的小事、照片，感兴趣的技术等</div>

        <!-- 文章列表 -->
        <div v-if="recentPosts.length > 0" class="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          <NuxtLink
            v-for="post in recentPosts"
            :key="post.cid"
            :to="`/content/${post.categories?.[0]?.slug || 'post'}/${post.slug || post.cid}`"
            class="group block no-underline">
            <div
              class="rounded-xl border border-slate-200 dark:border-gray-700 bg-white dark:bg-gray-900 overflow-hidden hover:border-blue-300 dark:hover:border-blue-600 hover:shadow-md dark:hover:shadow-gray-800/50 transition-all duration-300 h-55 flex flex-col">
              <!-- 封面 -->
              <div v-if="post.covers && post.covers.length > 0" class="aspect-video overflow-hidden grow">
                <img
                  :src="post.covers[0].url || post.covers[0]"
                  :alt="post.title"
                  class="w-full h-full object-cover group-hover:scale-105 transition-transform duration-300"
                  loading="lazy" />
              </div>
              <!-- 无封面占位 -->
              <div v-else class="bg-slate-100 dark:bg-gray-800 flex items-center justify-center grow">
                <span class="text-slate-400 dark:text-gray-500 text-4xl">{{ post.title[0] }}</span>
              </div>
              <!-- 文章信息 -->
              <div class="p-3">
                <h3
                  class="text-slate-900 dark:text-white font-medium text-sm line-clamp-2 mb-2 group-hover:text-blue-600 dark:group-hover:text-blue-400 transition-colors">
                  {{ post.title }}
                </h3>
                <div class="flex items-center gap-2 text-xs text-slate-500 dark:text-gray-400 flex-wrap">
                  <div v-if="post.categories && post.categories.length > 0" class="flex items-center gap-0.5" v-tooltip="'分类'">
                    <Icon name="ri:menu-line" class="size-3" />
                    <span v-for="(cat, idx) in post.categories" :key="cat.slug">
                      {{ cat.name }}<span v-if="idx < post.categories.length - 1">,</span>
                    </span>
                  </div>
                  <div v-if="post.tags && post.tags.length > 0" class="flex items-center gap-0.5" v-tooltip="'标签'">
                    <Icon name="ri:hashtag" class="size-3" />
                    <span v-for="(tag, idx) in post.tags.slice(0, 2)" :key="tag.slug">
                      {{ tag.name }}<span v-if="idx < Math.min(post.tags.length, 2) - 1">,</span>
                    </span>
                    <span v-if="post.tags.length > 2">+{{ post.tags.length - 2 }}</span>
                  </div>
                  <span class="flex items-center gap-0.5" v-tooltip="'发布时间'">
                    <Icon name="ri:time-line" class="size-3" />
                    {{ formatDate(post.created) }}
                  </span>
                  <span class="flex items-center gap-0.5" v-tooltip="'评论数量'">
                    <Icon name="ri:chat-2-line" class="size-3" />
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

        <!-- 查看更多 -->
        <div v-if="recentPosts.length > 0" class="text-center mt-8">
          <NuxtLink to="/archiving" class="inline-flex items-center gap-1 text-blue-600 dark:text-blue-400 hover:underline text-sm">
            查看全部文章
            <Icon name="ri:arrow-right-line" class="size-4" />
          </NuxtLink>
        </div>
      </section>

      <!-- 分类文章 -->
      <section v-if="categoryRecentPosts.length > 0" class="index-category-posts mx-auto max-w-275 animate-fade-in">
        <template v-for="(categoryData, index) in categoryRecentPosts" :key="categoryData.category.slug">
          <!-- 分类标题 -->
          <div class="flex items-center justify-between mb-6">
            <div>
              <h2 class="index-theme-title1 text-blue-700 dark:text-blue-500 text-sm">{{ categoryData.category.name }}</h2>
              <div class="text-slate-800 dark:text-white text-lg font-bold mt-1">{{ categoryData.category.desc }}</div>
            </div>
            <NuxtLink
              :to="`/category/${categoryData.category.slug}`"
              class="text-blue-600 dark:text-blue-400 hover:underline text-sm flex items-center gap-1">
              查看更多
              <Icon name="ri:arrow-right-line" class="size-4" />
            </NuxtLink>
          </div>

          <!-- 文章网格 -->
          <div class="flex flex-wrap gap-4" :class="{ 'mb-12': index < categoryRecentPosts.length - 1 }">
            <NuxtLink
              v-for="post in categoryData.posts"
              :key="post.cid"
              :to="`/content/${categoryData.category.slug}/${post.slug || post.cid}`"
              class="group block no-underline flex-[1_0_200px]">
              <div
                class="rounded-xl border border-slate-200 dark:border-gray-700 bg-white dark:bg-gray-900 overflow-hidden hover:border-blue-300 dark:hover:border-blue-600 hover:shadow-md dark:hover:shadow-gray-800/50 transition-all duration-300 h-55 flex flex-col">
                <!-- 封面 -->
                <div v-if="post.covers && post.covers.length > 0" class="aspect-video overflow-hidden grow">
                  <img
                    :src="post.covers[0].url || post.covers[0]"
                    :alt="post.title"
                    class="w-full h-full object-cover group-hover:scale-105 transition-transform duration-300"
                    loading="lazy" />
                </div>
                <!-- 无封面占位 -->
                <div v-else class="bg-slate-100 dark:bg-gray-800 flex items-center justify-center grow">
                  <span class="text-slate-400 dark:text-gray-500 text-4xl">{{ categoryData.category.name[0] }}</span>
                </div>
                <!-- 文章信息 -->
                <div class="p-3">
                  <h3
                    class="text-slate-900 dark:text-white font-medium text-sm line-clamp-2 mb-2 group-hover:text-blue-600 dark:group-hover:text-blue-400 transition-colors">
                    {{ post.title }}
                  </h3>
                  <div class="flex items-center gap-2 text-xs text-slate-500 dark:text-gray-400 flex-wrap">
                    <span v-if="post.tags && post.tags.length > 0" class="flex items-center gap-0.5" v-tooltip="'标签'">
                      <Icon name="ri:hashtag" class="size-3" />
                      <span v-for="(tag, idx) in post.tags.slice(0, 2)" :key="tag.slug">
                        {{ tag.name }}<span v-if="idx < Math.min(post.tags.length, 2) - 1">,</span>
                      </span>
                      <span v-if="post.tags.length > 2">+{{ post.tags.length - 2 }}</span>
                    </span>
                    <span class="flex items-center gap-0.5" v-tooltip="'发布时间'">
                      <Icon name="ri:time-line" class="size-3" />
                      <span>{{ formatDate(post.created) }}</span>
                    </span>
                    <span class="flex items-center gap-0.5" v-tooltip="'评论数量'">
                      <Icon name="ri:chat-2-line" class="size-3" />
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
        ref="sectionPhotos"
        v-if="photoImages.length > 0"
        class="index-photo-posts mt-12 mx-auto max-w-275 animate-fade-in"
        aria-labelledby="index-photo-posts-title">
        <h2 id="index-photo-posts-title" class="index-theme-title1 text-blue-700 dark:text-blue-500 text-sm text-center">最新图片</h2>
        <div class="index-theme-title2 text-slate-800 dark:text-white text-[1.6em] font-bold my-1 text-center">最近发布的图片</div>
        <div class="index-theme-title3 text-slate-500 dark:text-gray-400 text-sm mb-8 text-center">小物件，风景，合照，值得记录的瞬间</div>

        <!-- 图片瀑布流 -->
        <div class="columns-2 md:columns-3 lg:columns-4 gap-4 space-y-4">
          <NuxtLink
            v-for="(image, index) in photoImages"
            :key="index"
            :to="`/content/${image.categorySlug || 'shot'}/${image.slug || image.cid}`"
            class="block break-inside-avoid no-underline group">
            <div
              class="relative rounded-xl overflow-hidden border border-slate-200 dark:border-gray-700 bg-white dark:bg-gray-900 hover:border-blue-300 dark:hover:border-blue-600 hover:shadow-lg dark:hover:shadow-gray-800/50 transition-all duration-300">
              <LivePhoto
                :src="image.url"
                :alt="image.desc && image.desc.trim() ? `${image.desc} - ${image.title}` : image.title"
                class="w-full h-auto object-cover" />
              <!-- 悬浮标题 -->
              <div
                class="absolute inset-0 bg-linear-to-t from-black/35 via-transparent to-transparent opacity-0 group-hover:opacity-100 transition-opacity duration-300 pointer-events-none">
                <div class="absolute bottom-0 left-0 right-0 px-2 py-1">
                  <p class="text-white text-xs text-center font-medium line-clamp-2">
                    {{ image.desc && image.desc.trim() ? `${image.desc} - ${image.title}` : image.title }}
                  </p>
                </div>
              </div>
            </div>
          </NuxtLink>
        </div>

        <!-- 查看更多 -->
        <div class="text-center mt-8">
          <NuxtLink
            :to="`/category/${photoCategorySlug}`"
            class="inline-flex items-center gap-1 text-blue-600 dark:text-blue-400 hover:underline text-sm">
            查看全部图片
            <Icon name="ri:arrow-right-line" class="size-4" />
          </NuxtLink>
        </div>
      </section>

      <!-- 目录 -->
      <div
        class="max-sm:hidden flex mt-24 w-fit sticky bottom-2 border border-blue-400 dark:border-blue-180 bg-gray-50 shadow-xs dark:bg-slate-800 text-gray-700 dark:text-gray-100 rounded-full mx-auto text-sm dark:border-blue-700">
        <div
          v-for="(item, index) in tocItems"
          :key="item.id"
          class="px-4 py-2 rounded-full cursor-pointer hover:bg-gray-100 duration-150 dark:hover:bg-gray-700"
          :class="{ 'bg-blue-700 text-white hover:bg-blue-600!': activeTocIndex === index }"
          @click="scrollToSection(index)">
          {{ item.title }}
        </div>
      </div>
    </div>
    <!-- 间隔 -->
    <div class="h-62.5"></div>

    <!-- 阅读更多 -->
    <section class="index-read-more mx-auto max-w-275 animate-fade-in" aria-labelledby="index-read-more-title">
      <h2 id="index-read-more-title" class="index-theme-title2 text-slate-800 dark:text-white text-[1.6em] font-bold text-center">阅读更多</h2>
      <div class="index-read-more-inner flex flex-wrap justify-center gap-4 mt-8">
        <NuxtLink
          to="/subscribes"
          class="px-6 py-2.5 bg-slate-100 dark:bg-gray-800 hover:bg-slate-200 dark:hover:bg-gray-700 rounded-lg text-slate-700 dark:text-gray-200 transition-colors"
          >我的订阅</NuxtLink
        >
        <NuxtLink
          href="/agreement"
          class="px-6 py-2.5 bg-slate-100 dark:bg-gray-800 hover:bg-slate-200 dark:hover:bg-gray-700 rounded-lg text-slate-700 dark:text-gray-200 transition-colors"
          >协议</NuxtLink
        >
        <NuxtLink
          href="/sitemap"
          class="px-6 py-2.5 bg-slate-100 dark:bg-gray-800 hover:bg-slate-200 dark:hover:bg-gray-700 rounded-lg text-slate-700 dark:text-gray-200 transition-colors"
          >站点地图</NuxtLink
        >
        <NuxtLink
          href="/archiving"
          class="px-6 py-2.5 bg-slate-100 dark:bg-gray-800 hover:bg-slate-200 dark:hover:bg-gray-700 rounded-lg text-slate-700 dark:text-gray-200 transition-colors"
          >归档</NuxtLink
        >
        <NuxtLink
          to="/changelog"
          class="px-6 py-2.5 bg-slate-100 dark:bg-gray-800 hover:bg-slate-200 dark:hover:bg-gray-700 rounded-lg text-slate-700 dark:text-gray-200 transition-colors"
          >更新日志</NuxtLink
        >
        <NuxtLink
          to="/feed"
          target="_blank"
          class="px-6 py-2.5 bg-slate-100 dark:bg-gray-800 hover:bg-slate-200 dark:hover:bg-gray-700 rounded-lg text-slate-700 dark:text-gray-200 transition-colors"
          >订阅本站</NuxtLink
        >
      </div>
    </section>

    <!-- 间隔 -->
    <div class="h-37.5"></div>

    <!-- 订阅文章 -->
    <section
      v-if="subscribePosts.length > 0"
      class="index-subscribe-posts mx-auto max-w-275 animate-fade-in"
      aria-labelledby="index-subscribe-posts-title">
      <div class="flex items-center justify-between mb-6">
        <div>
          <h2 id="index-subscribe-posts-title" class="index-theme-title1 text-blue-700 dark:text-blue-500 text-sm">订阅文章</h2>
          <div class="text-slate-800 dark:text-white text-lg font-bold mt-1">来自订阅源的最新内容</div>
        </div>
        <NuxtLink to="/subscribes" class="text-blue-600 dark:text-blue-400 hover:underline text-sm flex items-center gap-1">
          查看更多
          <Icon name="ri:arrow-right-line" class="size-4" />
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
          class="block border rounded-lg p-4 hover:shadow-md hover:border-primary/50 transition-all no-underline group">
          <div class="flex items-start gap-3">
            <!-- 订阅源头像 -->
            <Avatar class="size-10 flex-shrink-0">
              <AvatarImage v-if="post.subscribeAvatar" :src="post.subscribeAvatar" />
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
            <Icon name="lucide:external-link" class="size-5 flex-shrink-0 text-muted-foreground group-hover:text-primary transition-colors" />
          </div>
        </a>
      </div>
    </section>

    <!-- 间隔 -->
    <div v-if="subscribePosts.length > 0" class="h-37.5"></div>

    <!-- 更新日志 -->
    <section v-if="recentChangelogs.length > 0" class="index-changelogs mx-auto max-w-275 animate-fade-in" aria-labelledby="index-changelogs-title">
      <div class="flex items-center justify-between mb-6">
        <div>
          <h2 id="index-changelogs-title" class="index-theme-title1 text-blue-700 dark:text-blue-500 text-sm">更新日志</h2>
          <div class="text-slate-800 dark:text-white text-lg font-bold mt-1">站点最新更新</div>
        </div>
        <NuxtLink to="/changelog" class="text-blue-600 dark:text-blue-400 hover:underline text-sm flex items-center gap-1">
          查看更多
          <Icon name="ri:arrow-right-line" class="size-4" />
        </NuxtLink>
      </div>

      <!-- 日志列表 -->
      <div class="space-y-4">
        <div v-for="log in recentChangelogs" :key="log.id" class="border rounded-lg p-4 hover:shadow-md transition-all">
          <div class="flex items-start gap-3">
            <!-- 类型文字标签 -->
            <div :class="`px-3 py-1 rounded-full text-xs font-medium flex-shrink-0 ${getClassInfo(log.class).color}`">
              {{ getClassInfo(log.class).label }}
            </div>

            <!-- 日志内容 -->
            <div class="flex-1 min-w-0">
              <div class="flex items-center gap-2 mb-1">
                <span class="text-sm text-muted-foreground">{{ formatChangelogDate(log.create_time) }}</span>
              </div>
              <div
                class="prose prose-slate dark:prose-invert max-w-none prose-p:text-sm prose-p:leading-relaxed markdown-content"
                v-html="log.descHtml" />
            </div>
          </div>
        </div>
      </div>
    </section>

    <!-- 底部间隔 -->
    <div class="h-37.5"></div>
  </div>
</template>

<script setup lang="ts">
import { onMounted, onUnmounted, ref } from "vue";
import MetingPlayer from "~/components/MetingPlayer.vue";

// 目录导航数据
const tocItems = [
  { id: "framework", title: "网站架构" },
  { id: "style", title: "样式选择" },
  { id: "content", title: "最新内容" },
  { id: "photos", title: "最新图片" },
];

// 当前激活的目录项索引
const activeTocIndex = ref(0);

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

// 目录滚动监听 - 更新当前激活项
const handleTocScroll = () => {
  const sections = [
    { el: sectionFramework.value, index: 0 },
    { el: sectionStyle.value, index: 1 },
    { el: sectionContent.value, index: 2 },
    { el: sectionPhotos.value, index: 3 },
  ];

  const scrollY = window.scrollY;
  const windowHeight = window.innerHeight;

  for (const section of sections) {
    if (!section.el) continue;
    const rect = section.el.getBoundingClientRect();
    const offsetTop = rect.top + scrollY;

    // 当 section 顶部在视口上方 1/3 处时激活
    if (scrollY >= offsetTop - windowHeight / 3 - NAV_HEIGHT) {
      activeTocIndex.value = section.index;
    }
  }
};

// 优化：使用聚合API一次性获取所有首页数据
const { data: homeData } = await useFetch("/api/home-data");

// 站点信息
const siteName = computed(() => homeData.value?.data?.site?.siteName || "ImQi1");

// 分类信息
const categories = computed(() => homeData.value?.data?.categories || []);

// 随机文章 - 客户端单独加载（避免ISR缓存导致不随机）
const { data: randomPostData } = await useFetch("/api/random-post");
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
  const images: { url: string; desc?: string; title: string; slug: string; cid: number; categorySlug?: string }[] = [];
  photoPosts.value.forEach(post => {
    if (post.covers && post.covers.length > 0) {
      post.covers.forEach(cover => {
        images.push({
          url: cover.url || (typeof cover === "string" ? cover : ""),
          desc: cover.desc,
          title: post.title,
          slug: post.slug,
          cid: post.cid,
          categorySlug: post.categories?.[0]?.slug,
        });
      });
    }
  });
  return images;
});

// 格式化日期
function formatDate(date: string | Date): string {
  const d = typeof date === "string" ? new Date(date) : date;
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

// 格式化更新日志日期
function formatChangelogDate(date: string | Date): string {
  const d = typeof date === "string" ? new Date(date) : date;
  return d.toLocaleDateString("zh-CN", {
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  });
}

function getClassInfo(classType: string) {
  const classMap: Record<string, { color: string; icon: string; label: string }> = {
    新增: { color: "bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400", icon: "lucide:plus-circle", label: "新增" },
    优化: { color: "bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-400", icon: "lucide:zap", label: "优化" },
    修复: { color: "bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-400", icon: "lucide:bug", label: "修复" },
    删除: { color: "bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400", icon: "lucide:trash-2", label: "删除" },
    重构: { color: "bg-purple-100 text-purple-700 dark:bg-purple-900/30 dark:text-purple-400", icon: "lucide:refresh-cw", label: "重构" },
  };

  return classMap[classType] || { color: "bg-gray-100 text-gray-700 dark:bg-gray-900/30 dark:text-gray-400", icon: "lucide:circle", label: classType };
}

// 页面元数据
const siteUrl = "https://imqi1.com";
useHead({
  title: siteName,
  meta: [
    {
      name: "description",
      content: "ImQi1 - 做技术的分享者、生活的摄影师、时事的评论员。记录编程学习、生活点滴和时事评论的个人博客。",
    },
    {
      name: "keywords",
      content: "ImQi1,个人博客,技术博客,编程,Nuxt,Vue,JavaScript,摄影,时事评论",
    },
    {
      property: "og:title",
      content: siteName,
    },
    {
      property: "og:description",
      content: "做技术的分享者、生活的摄影师、时事的评论员。记录编程学习、生活点滴和时事评论的个人博客。",
    },
    {
      property: "og:type",
      content: "website",
    },
    {
      name: "twitter:title",
      content: siteName,
    },
    {
      name: "twitter:description",
      content: "做技术的分享者、生活的摄影师、时事的评论员。记录编程学习、生活点滴和时事评论的个人博客。",
    },
  ],
});

// 首页Hero下文字
const homeAnnounce = computed(() => homeData.value?.data?.site?.homeCustomText || "<p>做技术的分享者 · 生活的摄影师 · 时事的评论员</p>");

// 图片分类slug
const photoCategorySlug = computed(() => homeData.value?.data?.site?.photoCategorySlug || "shot");

// 联系链接配置
const contactLinks = ref([
  { name: "email", url: "mailto:imqi1@qq.com", icon: "ri:mail-fill", target: true, title: "邮箱" },
  { name: "github", url: "https://github.com/imqi1-github", icon: "ri:github-fill", target: true, title: "GitHub" },
  { name: "npm", url: "https://www.npmjs.com/~imqi1-npm", icon: "ri:npmjs-fill", target: true, title: "npm" },
  { name: "x", url: "https://x.com/imqi1_X", icon: "ri:twitter-x-fill", target: true, title: "X" },
  { name: "home", url: "https://qi1.website", icon: "ri:home-2-fill", target: true, title: "个人首页" },
  { name: "link", url: "/links", icon: "ri:links-fill", target: false, title: "友情链接" },
]);

// 样式选择区域数据
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
    ],
  },
  {
    title: "调整布局",
    type: "content",
    content: "适当采用圆角、阴影、遮罩、背景，添加动画、交互，让页面尽量简洁的同时不牺牲用户体验。",
  },
  {
    title: "用小组件丰富文章内容",
    type: "grid",
    grids: [{ text: "音乐播放器" }, { text: "视频播放器" }, { text: "代码块" }, { text: "TIP 组件" }, { text: "轮播图" }, { text: "..." }],
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
  },
]);

const themeRightItems = [{ type: "fonts" }, { type: "layout", image: "/imgs/shenyang.webp" }, { type: "music" }, { type: "article" }];

// 当前激活的样式索引
const activeThemeIndex = ref(0);

// 样式选项元素的ref数组 - 使用Set去重
const themeItemRefsSet = new Set();
const themeItemRefs = ref([]);

const setThemeItemRef = el => {
  if (el) {
    themeItemRefsSet.add(el);
    themeItemRefs.value = Array.from(themeItemRefsSet);
  }
};

// 滚动跟随效果 - 检查哪个item在视口中心
let lastScrollY = 0;
const checkVisibleItems = () => {
  const refs = themeItemRefs.value;
  if (!refs || refs.length === 0) return;

  // 找到最接近视口中心的item
  let closestIndex = 0;
  let closestDistance = Infinity;

  refs.forEach((el, index) => {
    if (!el) return;
    const rect = el.getBoundingClientRect();
    const itemCenter = rect.top + rect.height / 2;
    const viewportCenter = window.innerHeight / 2;
    const distance = Math.abs(itemCenter - viewportCenter);

    if (distance < closestDistance) {
      closestDistance = distance;
      closestIndex = index;
    }
  });

  if (closestIndex !== activeThemeIndex.value) {
    activeThemeIndex.value = closestIndex;
  }
};

// 英雄区引用和样式
const heroRef = ref(null);
const heroStyle = ref({
  transform: "scale(1)",
  opacity: "1",
  display: "flex",
});

// 滚动处理 - 英雄区缩放/淡出效果
const handleScroll = () => {
  const scrollTop = window.scrollY;
  const windowHeight = window.innerHeight;

  if (heroRef.value) {
    const maxOffset = windowHeight - 500;
    const offset = Math.min(scrollTop, maxOffset);
    const scale = 1 - (offset / maxOffset) * 0.2;
    const opacity = 1 - offset / maxOffset;

    // 当滚动超过阈值时隐藏
    if (scrollTop > windowHeight - 200) {
      heroStyle.value = {
        transform: `scale(${Math.max(scale, 0)})`,
        opacity: "0",
        display: "none",
        pointerEvents: "none",
      };
    } else {
      heroStyle.value = {
        transform: `scale(${Math.max(scale, 0)})`,
        opacity: Math.max(opacity, 0).toString(),
        display: "flex",
        pointerEvents: "auto",
      };
    }
  }
};

// 滚动监听函数 - 样式选择区域跟随效果
const handleStyleScroll = () => {
  requestAnimationFrame(checkVisibleItems);
};

// IntersectionObserver 实例
let fadeInObserver: IntersectionObserver | null = null;

// 初始化滚动动画
onMounted(async () => {
  // 立即执行一次滚动检测，确保页面加载时状态正确
  handleScroll();
  checkVisibleItems();

  // 监听滚动 - 英雄区缩放/淡出
  window.addEventListener("scroll", handleScroll);

  // 监听滚动 - 样式选择区域跟随效果
  window.addEventListener("scroll", handleStyleScroll);

  // 监听滚动 - 目录导航高亮
  window.addEventListener("scroll", handleTocScroll);
  handleTocScroll();

  // 等待 ClientOnly 内容渲染完成
  await nextTick();

  // 滚动渐入效果监听
  const observerOptions = {
    threshold: 0.1,
    rootMargin: "0px 0px -50px 0px",
  };

  fadeInObserver = new IntersectionObserver(entries => {
    entries.forEach(entry => {
      if (entry.isIntersecting) {
        entry.target.classList.add("fade-in-start");
        fadeInObserver?.unobserve(entry.target);
      }
    });
  }, observerOptions);

  // 观察所有需要滚动渐入的元素
  document.querySelectorAll(".animate-fade-in:not(.fade-in-start)").forEach(el => {
    fadeInObserver?.observe(el);
  });
});

onUnmounted(() => {
  window.removeEventListener("scroll", handleScroll);
  window.removeEventListener("scroll", handleStyleScroll);
  window.removeEventListener("scroll", handleTocScroll);
  fadeInObserver?.disconnect();
});
</script>

<style scoped>
/* 滚动淡入动画 */
.animate-fade-in {
  opacity: 0;
  transform: translateY(30px);
  transition:
    opacity 0.6s cubic-bezier(0.4, 0, 0.2, 1),
    transform 0.6s cubic-bezier(0.4, 0, 0.2, 1);
}

.animate-fade-in.fade-in-start {
  opacity: 1;
  transform: translateY(0);
}

@keyframes fade-in {
  to {
    opacity: 1;
    transform: translateY(0);
  }
}

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

/* 响应式调整 */
@media (max-width: 768px) {
  .index-first-line {
    font-size: 3em !important;
  }

  .index-avatar {
    max-width: 120px !important;
    width: 120px !important;
    height: 120px !important;
  }

  .index-hero-box {
    flex-direction: column;
    text-align: center;
    gap: 2rem;
  }

  .index-contact {
    flex-wrap: wrap;
    justify-content: center;
  }
}
</style>
