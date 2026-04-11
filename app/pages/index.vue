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
          <RiMouseLine class="size-4" />
        </div>
      </div>

      <!-- 联系链接 -->
      <div class="index-contact flex mt-3 self-start animate-fade-in max-md:mx-auto">
        <NuxtLink
          v-for="link in contactLinks"
          :key="link.name"
          :href="link.url"
          :target="link.target ? '_blank' : undefined"
          class="index-contact-link group relative flex items-center justify-center w-9 h-9 rounded-md transition-all duration-200 text-gray-500 dark:text-gray-400 hover:bg-slate-100 dark:hover:bg-gray-800 hover:text-slate-900 dark:hover:text-white">
          <component :is="link.icon" class="size-5" />
          <!-- 小程序二维码 -->
          <template v-if="link.name === 'miniprogram'">
            <img
              src="/imgs/miniprogram.jpg"
              alt="小程序码"
              style="width: 192px; height: 192px; max-width: none; max-height: none"
              class="absolute bottom-full left-1/2 -translate-x-1/2 border border-slate-100 opacity-0 invisible group-hover:opacity-100 group-hover:visible transition-all duration-200 pointer-events-none group-hover:pointer-events-auto rounded-full" />
          </template>
        </NuxtLink>
      </div>
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
              <svg xmlns="http://www.w3.org/2000/svg" class="index-framework-pic size-25" width="128" height="128" viewBox="0 0 128 128"><path fill="#00dc82" d="M71.679 106.667h47.359c1.514 0 2.962-.533 4.268-1.283c1.307-.75 2.66-1.688 3.415-2.986S128 99.629 128 98.134s-.524-2.971-1.279-4.268l-32-55.038c-.755-1.297-1.68-2.24-2.99-2.991c-1.312-.751-3.18-1.279-4.695-1.279c-1.514 0-2.957.533-4.263 1.279s-2.232 1.693-2.987 2.991l-8.108 14.08l-16.213-27.311c-.755-1.297-1.68-2.66-2.986-3.41s-2.755-.854-4.269-.854s-2.957.104-4.264.854c-1.306.75-2.66 2.113-3.415 3.41L.854 93.864C.099 95.161 0 96.634 0 98.134s.099 2.966.854 4.263c.754 1.297 2.103 2.24 3.415 2.986c1.311.747 2.754 1.284 4.264 1.284H38.4c11.835 0 20.449-5.31 26.453-15.364l14.505-25.17l7.678-13.226l23.468 40.104H79.359ZM37.97 93.01H17.066l31.147-53.76L64 66.134L53.543 84.361c-3.986 6.523-8.533 8.65-15.572 8.65zm0 0"/></svg>
              <span class="absolute -bottom-6 left-0 right-0 text-center text-sm text-slate-500 dark:text-gray-400">Nuxt</span>
            </div>
            <div class="index-framework-arrow max-md:mt-7">
              <RiAddLargeLine class="text-2xl text-slate-400 dark:text-gray-500" />
            </div>
            <div class="index-framework-item flex flex-col relative">
              <svg xmlns="http://www.w3.org/2000/svg" class="index-framework-pic size-25" width="32" height="32" viewBox="0 0 32 32"><path fill="#00bfa5" d="m27.777 22.617l-.459-.946L18.43 3.26a2.25 2.25 0 0 0-1.914-1.256A2 2 0 0 0 16.379 2a2.23 2.23 0 0 0-1.891 1.042L4.348 19.056a2.2 2.2 0 0 0 .025 2.417l4.957 7.488A2.34 2.34 0 0 0 11.29 30a2.4 2.4 0 0 0 .655-.092l14.387-4.149a2.32 2.32 0 0 0 1.458-1.234a2.21 2.21 0 0 0-.013-1.908m-3.538.604l-11.268 3.25l4.075-19.033l7.568 15.671l-.376.098Z"/></svg>
              <span class="absolute -bottom-6 left-0 right-0 text-center text-sm text-slate-500 dark:text-gray-400">Prisma</span>
            </div>
            <div class="index-framework-arrow max-md:mt-7">
              <RiAddLargeLine class="text-2xl text-slate-400 dark:text-gray-500" />
            </div>
            <div class="index-framework-item flex flex-col relative">
              <svg xmlns="http://www.w3.org/2000/svg" class="index-framework-pic size-25" width="512" height="349" viewBox="0 0 512 349"><path fill="#00758f" d="m152.31 230.297l15.56 50.487c3.496 11.463 4.954 19.465 4.37 24.026q12.765-34.188 17.839-74.513h18.71q-12.069 65.65-31.827 95.41c-10.262 15.289-21.504 22.933-33.746 22.933c-3.264 0-7.288-.986-12.063-2.944v-10.55c2.333.342 5.07.525 8.218.525q8.565-.002 13.816-4.742c4.193-3.849 6.292-8.175 6.292-12.97c0-3.274-1.637-9.993-4.896-20.157l-21.68-67.505zM33.223 199.266l28.5 86.956h.176l28.675-86.956h23.428c5.13 43.124 8.16 82.581 9.09 118.346H103.34q-1.044-50.148-5.768-94.32H97.4l-30.078 94.32H52.28l-29.896-94.32h-.176q-3.325 42.422-4.196 94.32H0c1.164-42.08 4.077-81.525 8.739-118.346z"/><path fill="#f29111" d="M352.498 197.51c30.657 0 45.986 19.586 45.986 58.739c0 21.276-4.61 37.347-13.821 48.204c-1.66 1.984-3.495 3.698-5.427 5.286l21.695 10.727l-.021-.001l-7.703 13.302l-28.253-16.485q-7.026 2.08-15.451 2.08c-15.053 0-26.297-4.387-33.731-13.15c-8.16-9.694-12.238-24.955-12.238-45.757c0-21.156 4.602-37.166 13.816-48.037c8.392-9.944 20.11-14.909 35.148-14.909m-93.88.172c10.957 0 20.92 2.932 29.894 8.775l-4.558 10.157c-7.679-3.264-15.25-4.903-22.716-4.903c-6.058 0-10.726 1.458-13.98 4.392c-3.272 2.908-5.296 6.65-5.296 11.212c0 7.01 4.994 13.089 14.215 18.225a816 816 0 0 1 9.031 5.011l.688.387l.345.194l.689.387l.344.194l.688.388c6.98 3.935 13.548 7.691 13.548 7.691c9.22 6.545 13.816 13.523 13.816 25.016c0 10.037-3.678 18.276-11.01 24.723c-7.337 6.418-17.194 9.636-29.538 9.636c-11.545 0-22.734-3.704-33.572-11.05l5.07-10.166c9.327 4.675 17.767 7.01 25.346 7.01c7.108 0 12.672-1.587 16.697-4.721c4.017-3.157 6.424-7.56 6.424-13.143c0-7.027-4.888-13.034-13.855-18.073a898 898 0 0 1-8.395-4.697l-.687-.389c-1.262-.713-2.533-1.435-3.778-2.142l-.675-.384c-6.055-3.444-11.29-6.453-11.29-6.453c-8.964-6.557-13.459-13.592-13.459-25.184c0-9.587 3.352-17.336 10.046-23.231q10.066-8.862 25.968-8.862m175.895 1.584v103.788h37.238v14.558h-56.124V199.266zm57.93 103.833v2.46h-4.094v12.04h-3.13v-12.04h-4.253v-2.46zm7.56 0l3.931 9.884l3.611-9.884h4.437v14.5h-2.95v-11.035l-4.11 11.035h-2.127l-4.117-11.035h-.158v11.035h-2.791v-14.5zM350.57 212.064c-18.066 0-27.104 14.91-27.104 44.71c0 17.07 2.395 29.448 7.176 37.163c4.428 7.14 11.363 10.703 20.806 10.703c18.066 0 27.103-15.026 27.103-45.064c0-16.831-2.395-29.103-7.17-36.822c-4.433-7.124-11.365-10.69-20.81-10.69"/><path fill="#00758f" d="M303.218 7.333c5.993-14.726 26.948-3.574 35.08 1.57c1.993 1.287 4.279 4.006 6.564 5.011c3.565.14 7.127.419 10.698.568c6.698 1.574 12.972 2.86 18.25 5.866c24.528 14.445 40.495 29.165 55.19 53.479c3.14 5.15 4.709 10.723 7.274 16.296c3.56 8.307 7.56 17.027 11.692 24.882c1.85 3.724 3.281 7.865 5.85 11.01c1.003 1.438 3.852 1.862 5.555 2.721c4.708 2.437 10.412 4.287 14.84 7.147c8.269 5.156 16.264 11.3 23.532 17.59c2.709 2.428 4.555 5.865 7.136 8.433v1.296c-2.291.703-4.574 1.423-6.859 2c-4.991 1.282-9.412.992-14.254 2.275c-2.992.868-6.707 2.013-9.845 2.304l.29.292c1.846 5.275 11.834 9.565 16.402 12.72c5.548 4.004 10.689 8.86 14.827 14.437c1.429 1.423 2.858 2.718 4.28 4.137c.994 1.438 1.274 3.298 2.28 4.58v.434c-1.114-.393-1.915-1.143-2.674-1.927l-.453-.473c-.453-.47-.91-.932-1.431-1.313c-3.148-2.15-6.274-4.722-9.422-6.721c-5.412-3.434-11.689-5.427-17.246-8.874c-3.142-2.001-6.137-4.28-9.132-6.57c-2.715-2.007-5.705-5.861-7.411-8.721c-1.005-1.58-1.143-3.437-2.291-4.58c.205-1.909 1.954-2.476 3.719-2.942l.406-.107c.609-.158 1.205-.316 1.725-.525c7.414-3.148 16.253-4.29 27.667-4.004c-.43-2.866-7.562-6.437-9.839-8.153c-4.57-3.294-9.409-6.731-14.257-9.729c-2.569-1.57-6.996-2.716-9.842-3.999c-3.851-1.574-12.41-3.147-14.544-6.145c-3.625-4.726-6.229-10.363-8.757-16.057l-.688-1.554l-.69-1.553c-2.988-6.857-6.7-14.006-9.695-21.027c-1.566-3.425-2.285-6.431-4-9.716c-10.407-20.158-25.81-37.035-44.485-48.904c-6.137-3.862-12.98-7.436-20.534-9.865c-4.281-1.293-9.419-.578-13.98-1.57h-3.002c-2.562-.722-4.701-3.438-6.7-4.87c-4.415-2.998-8.837-5.011-14.117-7.15c-1.85-.858-7.133-2.856-8.977-1.283c-1.142.287-1.721.718-2.002 1.864c-1.136 1.71-.137 4.286.57 5.863c2.142 4.57 5.134 7.286 7.85 11.148c2.416 3.425 5.417 7.287 7.13 11.011c3.696 8.005 5.417 16.874 8.842 24.878c1.27 3.01 3.279 6.435 5.128 9.15c1.567 2.155 4.416 3.713 5.278 6.441c1.718 2.86-2.572 12.297-3.565 15.294c-3.715 11.727-2.995 28.028 1.283 38.193l.228.536l.228.543c1.562 3.723 3.234 7.732 7.387 8.773c.286-.284 0-.135.567-.284c1.005-7.868 1.288-15.445 4-21.601c1.567-3.849 4.696-6.57 6.841-9.712c1.43.856 1.43 3.437 2.282 5.145c1.856 4.43 3.849 9.287 6.137 13.73c4.696 9.15 9.98 18.021 15.967 26.025c2.005 2.859 4.85 6.006 7.416 8.581c1.143.997 2.423 1.573 3.282 2.856h.28v.432c-4.278-1.577-6.99-6.003-10.402-8.587c-6.424-4.857-14.117-12.151-18.545-19.15c-1.852-4.018-3.854-7.869-5.85-11.867v-.289c-.853 1.142-.567 2.276-.994 4.004c-1.852 7.145-.426 15.296-6.843 17.866c-7.274 3.01-12.7-4.857-14.977-8.432c-7.276-11.866-9.269-31.884-4.138-48.043c1.14-3.577 1.295-7.867 3.285-10.723c-.43-2.582-2.42-3.288-3.571-4.87c-1.996-2.704-3.705-5.854-5.268-8.857c-3.002-5.866-5.138-12.875-7.417-19.166c-1.002-2.569-1.289-5.148-2.288-7.58c-1.704-3.712-4.845-7.436-7.268-10.72c-3.281-4.72-12.837-13.868-8.985-23.168m46.772 28.015c.381.382.841.716 1.317 1.045l.574.394c.765.53 1.506 1.088 1.96 1.848c.72 1.006.854 1.999 1.716 3.007c0 3.437-.996 5.722-3.007 7.146c0 0-.137.15-.278.29c-1.14-2.291-2.139-4.57-3.287-6.859c-1.414-1.998-3.413-3.583-4.565-5.866h-.277v-.287c1.721-.425 3.428-.718 5.847-.718"/></svg>
              <span class="absolute -bottom-6 left-0 right-0 text-center text-sm text-slate-500 dark:text-gray-400">MySQL</span>
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
          <div class="index-theme-themes mb-50 max-md:text-center">
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
                      <span><RiAttachmentLine class="text-slate-600 dark:text-gray-400" /></span>
                      <span><RiFileZipFill class="text-slate-600 dark:text-gray-400" /></span>
                      <span><RiVideoFill class="text-slate-600 dark:text-gray-400" /></span>
                      <span><RiRestartLine class="text-slate-600 dark:text-gray-400" /></span>
                    </div>
                  </div>

                  <!-- 布局图片 -->
                  <div v-else-if="rightItem.type === 'layout'" class="index-theme-box relative h-75 w-75">
                    <div
                      class="index-theme-img absolute top-6 left-6 w-50 h-50 rounded-xl shadow-sm bg-cover bg-center border border-slate-200 dark:border-gray-700 bg-white dark:bg-gray-900 overflow-hidden">
                      <img src="/imgs/shenyang.webp" class="absolute inset-0 aspect-square object-cover" alt="沈阳站" />
                    </div>
                    <div
                      class="index-theme-border absolute top-31 left-36 w-38 h-38 bg-slate-100 dark:bg-gray-800 rounded-xl border border-slate-200 dark:border-gray-700 transition-transform"></div>
                  </div>

                  <!-- 音乐播放器 -->
                  <div v-else-if="rightItem.type === 'music'" class="index-theme-box relative h-75 w-75 flex items-center justify-center">
                    <div class="index-theme-music-box absolute top-1/2 -left-24 -right-15 -translate-y-1/2">
                      <MetingPlayer
                        server="netease"
                        type="song"
                        id="2142943893"
                        :listFolded="false"
                        :mutex="true"
                      />
                    </div>
                  </div>

                  <!-- 文章预览 -->
                  <div v-else-if="rightItem.type === 'article'" class="index-theme-box relative h-75 w-75 flex items-center justify-center">
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
        <div v-if="recentPosts.length > 0" class="index-recent-posts-list gap-4 flex flex-wrap">
          <NuxtLink
            v-for="post in recentPosts"
            :key="post.cid"
            :to="`/content/${post.categories?.[0]?.slug || 'post'}/${post.slug || post.cid}`"
            class="index-recent-post-item block p-4 rounded-xl border border-slate-200 dark:border-gray-700 bg-white dark:bg-gray-900 hover:border-blue-300 dark:hover:border-blue-600 hover:shadow-md dark:hover:shadow-gray-800/50 transition-all duration-300 no-underline flex-[1_0_400px]">
            <div class="flex gap-4">
              <!-- 封面图片 -->
              <div v-if="post.covers && post.covers.length > 0" class="flex-shrink-0 w-32 h-24 rounded-lg overflow-hidden">
                <img :src="post.covers[0].url || post.covers[0]" :alt="post.title" class="w-full h-full object-cover" loading="lazy" />
              </div>
              <!-- 文章信息 -->
              <div class="flex-1 min-w-0 flex flex-col justify-between min-h-24">
                <div>
                  <h3 class="text-slate-900 dark:text-white font-bold text-base line-clamp-1 mb-1">{{ post.title }}</h3>
                  <p v-if="post.desc" class="text-slate-500 dark:text-gray-400 text-sm line-clamp-2">{{ post.desc }}</p>
                </div>
                <div class="flex gap-1 text-xs text-slate-400 dark:text-gray-500 mt-2 flex-col">
                  <div v-if="post.categories && post.categories.length > 0" class="flex items-center gap-1 flex-wrap">
                    <RiMenuLine class="size-3.5" />
                    <span v-for="(cat, idx) in post.categories" :key="cat.slug" class="text-gray-500 dark:text-gray-400">
                      {{ cat.name }}<span v-if="idx < post.categories.length - 1">,</span>
                    </span>
                  </div>
                  <div class="flex items-center gap-1">
                    <RiTimeLine class="size-3.5" />
                    <span>{{ formatDate(post.created) }}</span>
                  </div>
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
            <RiArrowRightLine class="size-4" />
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
              <div class="text-slate-800 dark:text-white text-lg font-bold mt-1">{{ categoryData.category.name }}分类</div>
            </div>
            <NuxtLink
              :to="`/category/${categoryData.category.slug}`"
              class="text-blue-600 dark:text-blue-400 hover:underline text-sm flex items-center gap-1">
              查看更多
              <RiArrowRightLine class="size-4" />
            </NuxtLink>
          </div>

          <!-- 文章网格 -->
          <div class="flex flex-wrap gap-4" :class="{ 'mb-12': index < categoryRecentPosts.length - 1 }">
            <NuxtLink
              v-for="post in categoryData.posts"
              :key="post.cid"
              :to="`/content/${post.categories?.[0]?.slug || 'post'}/${post.slug || post.cid}`"
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
                  <div class="flex items-center gap-2 text-xs text-slate-400 dark:text-gray-500">
                    <span>{{ formatDate(post.created) }}</span>
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
              <img :src="image.url" :alt="image.desc || image.title" class="w-full h-auto object-cover" loading="lazy" />
              <!-- 悬浮标题 -->
              <div
                class="absolute inset-0 bg-linear-to-t from-black/60 via-transparent to-transparent opacity-0 group-hover:opacity-100 transition-opacity duration-300">
                <div class="absolute bottom-0 left-0 right-0 p-3">
                  <p class="text-white text-sm font-medium line-clamp-2">{{ image.desc || image.title }}</p>
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
            <RiArrowRightLine class="size-4" />
          </NuxtLink>
        </div>
      </section>

      <!-- 目录 -->
      <div
        class="max-sm:hidden flex mt-24 w-fit sticky bottom-2 border border-blue-400 dark:border-blue-180 bg-gray-50 shadow-xs dark:bg-slate-800 text-gray-700 dark:text-gray-100 rounded-full mx-auto text-sm">
        <div
          v-for="(item, index) in tocItems"
          :key="item.id"
          class="px-4 py-2 rounded-full cursor-pointer hover:bg-gray-100 duration-150"
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
        <a
          href="/sitemap"
          class="px-6 py-2.5 bg-slate-100 dark:bg-gray-800 hover:bg-slate-200 dark:hover:bg-gray-700 rounded-lg text-slate-700 dark:text-gray-200 transition-colors"
          >站点地图</a
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

    <!-- 底部间隔 -->
    <div class="h-37.5"></div>
  </div>
</template>

<script setup lang="ts">
import {
  RiAddLargeLine,
  RiArrowRightLine,
  RiAttachmentLine,
  RiFileZipFill,
  RiGithubFill,
  RiHome2Fill,
  RiLinksFill,
  RiMailFill,
  RiMenuLine,
  RiMiniProgramFill,
  RiMouseLine,
  RiNpmjsFill,
  RiRestartLine,
  RiTimeLine,
  RiTwitterXFill,
  RiVideoFill,
} from "@remixicon/vue";
import { markRaw, onMounted, onUnmounted, ref } from "vue";
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

// 获取站点信息
const { data } = await useFetch("/api/site");
const siteName = computed(() => data.value?.data?.siteName || "ImQi1");

// 获取分类信息（前4个）
const { data: categoriesData } = await useFetch("/api/categories?limit=4");
const categories = computed(() => categoriesData.value?.data || []);

// 获取随机文章
const { data: randomPostData } = await useFetch("/api/random-post");
const randomPost = computed(() => randomPostData.value?.data);

// 获取最新文章
const { data: recentPostsData } = await useFetch("/api/recent-posts?limit=6");
const recentPosts = computed(() => recentPostsData.value?.data || []);

// 获取图片文章
const { data: photoPostsData } = await useFetch("/api/photo-posts?limit=4");
const photoPosts = computed(() => photoPostsData.value?.data || []);

// 获取分类文章（mid最小的3个分类，每个分类最新4篇，排除最新发布中的文章）
const { data: categoryRecentPostsData } = await useFetch("/api/category-recent-posts?limit=4");
const categoryRecentPosts = computed(() => categoryRecentPostsData.value?.data || []);

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
  const year = d.getFullYear();
  const month = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

// 页面元数据
useHead({
  title: siteName,
});

// 首页Hero下文字
const homeAnnounce = computed(() => data.value?.data?.homeCustomText || "<p>做技术的分享者 · 生活的摄影师 · 时事的评论员</p>");

// 图片分类slug
const photoCategorySlug = computed(() => data.value?.data?.photoCategorySlug || "shot");

// 联系链接配置
const contactLinks = ref([
  { name: "email", url: "mailto:imqi1@qq.com", icon: markRaw(RiMailFill), target: true },
  { name: "github", url: "https://github.com/imqi1-github", icon: markRaw(RiGithubFill), target: true },
  { name: "npm", url: "https://www.npmjs.com/~imqi1-npm", icon: markRaw(RiNpmjsFill), target: true },
  { name: "x", url: "https://x.com/imqi1_X", icon: markRaw(RiTwitterXFill), target: true },
  { name: "home", url: "https://qi1.website", icon: markRaw(RiHome2Fill), target: true },
  { name: "link", url: "/links", icon: markRaw(RiLinksFill), target: false },
  { name: "miniprogram", url: "", icon: markRaw(RiMiniProgramFill), target: false },
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
onMounted(() => {
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
