<template>
  <div class="m-auto max-w-7xl min-h-screen overflow-x-hidden relative w-full">
    <div
      class="bottom-0 text-slate-100 dark:text-slate-800 text-[clamp(4rem,12vw,16rem)] font-extrabold left-[3%] tracking-tighter pointer-events-none leading-[.8] fixed [text-orientation:mixed] select-none [writing-mode:sideways-lr] z-0 transition-colors duration-300">
      <h1 id="about-page-title" class="sr-only">关于我</h1>
      {{ brandDomain }}
    </div>

    <div class="p-10 md:p-6 max-sm:p-4 relative z-10">
      <!-- 头部区域 -->
      <div class="ready grid grid-cols-1 md:grid-cols-2 gap-16 items-end mb-32 max-md:gap-32">
        <div class="pl-8">
          <div
            class="w-48 h-48 rounded-full border-6 border-slate-100 dark:border-slate-700 shadow-lg overflow-hidden mb-8 transition-colors duration-300">
            <img :src="siteConfig.siteAvatarPath" :alt="siteConfig.ownerName" class="w-full h-full object-cover" >
          </div>
          <h1
            class="text-slate-900 dark:text-slate-100 text-[clamp(3rem,8vw,6rem)] font-black tracking-tight leading-[.9] mb-4 transition-colors duration-300">
            {{ siteConfig.ownerName }}
          </h1>
          <p class="text-slate-600 dark:text-slate-400 text-lg leading-relaxed max-w-xs transition-colors duration-300">
            {{ siteConfig.links.profile.siteDescription }}
          </p>
        </div>
        <div class="pb-8 text-right max-md:text-left">
          <div class="text-blue-600 dark:text-blue-400 text-xs tracking-widest mb-4 uppercase transition-colors duration-300">ABOUT ME</div>
          <div class="text-slate-800 dark:text-slate-200 text-2xl font-medium leading-relaxed mb-8 transition-colors duration-300">
            我热爱编程，喜欢记录生活，分享有趣的事情。这是我的个人博客，记录着技术、生活和思考。
          </div>
          <div class="flex flex-wrap gap-3 justify-end max-md:justify-start">
            <span
              class="bg-slate-100 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 text-slate-600 dark:text-slate-400 rounded-full text-sm px-4 py-2 transition-colors duration-300"
              >💻 全栈开发者</span
            >
            <span
              class="bg-slate-100 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 text-slate-600 dark:text-slate-400 rounded-full text-sm px-4 py-2 transition-colors duration-300"
              >📸 摄影爱好者</span
            >
            <span
              class="bg-slate-100 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 text-slate-600 dark:text-slate-400 rounded-full text-sm px-4 py-2 transition-colors duration-300"
              >🎵 音乐迷</span
            >
            <span
              class="bg-slate-100 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 text-slate-600 dark:text-slate-400 rounded-full text-sm px-4 py-2 transition-colors duration-300"
              >✍️ 博主</span
            >
          </div>
        </div>
      </div>

      <!-- 游山玩水 -->
      <div class="ready ml-[5%] mb-24 max-md:ml-0">
        <div class="text-blue-600 dark:text-blue-400 text-xs font-bold mb-2 transition-colors duration-300">01</div>
        <h2
          class="text-slate-900 dark:text-slate-100 text-[clamp(2rem,5vw,3.5rem)] font-extrabold tracking-tight leading-none mb-8 transition-colors duration-300">
          游山玩水
        </h2>
        <div class="grid grid-cols-1 md:grid-cols-3 gap-6">
          <div class="aspect-video rounded-2xl overflow-hidden relative">
            <img class="w-full h-full object-cover transition-transform duration-300" :src="publicAsset('/imgs/jixi.webp')" alt="沈阳" >
            <div class="absolute bottom-0 left-0 right-0 bg-linear-to-t from-black/70 to-transparent text-white p-6">
              <div class="text-xs mb-1 opacity-80">来自</div>
              <div class="text-lg font-semibold">黑龙江省鸡西市</div>
            </div>
          </div>
          <div class="aspect-video rounded-2xl overflow-hidden relative">
            <img class="w-full h-full object-cover transition-transform duration-300" :src="publicAsset('/imgs/ysu.webp')" alt="燕山大学" >
            <div class="absolute bottom-0 left-0 right-0 bg-linear-to-t from-black/70 to-transparent text-white p-6">
              <div class="text-xs mb-1 opacity-80">毕业于</div>
              <div class="text-lg font-semibold">燕山大学</div>
            </div>
          </div>
          <div class="aspect-video rounded-2xl overflow-hidden relative">
            <img class="w-full h-full object-cover transition-transform duration-300" :src="publicAsset('/imgs/shenyang.webp')" alt="秦皇岛" >
            <div class="absolute bottom-0 left-0 right-0 bg-linear-to-t from-black/70 to-transparent text-white p-6">
              <div class="text-xs mb-1 opacity-80">现居</div>
              <div class="text-lg font-semibold">辽宁省沈阳市</div>
            </div>
          </div>
        </div>
        <MapEntryLinks :views="['travels']" title="看看我都去过哪里" class="mt-4" />
      </div>

      <!-- 技多不压身 -->
      <div class="ready ml-[50%] mb-24 max-md:ml-0">
        <div class="text-blue-600 dark:text-blue-400 text-xs font-bold mb-2 transition-colors duration-300">02</div>
        <h2
          class="text-slate-900 dark:text-slate-100 text-[clamp(2rem,5vw,3.5rem)] font-extrabold tracking-tight leading-none mb-8 transition-colors duration-300">
          技多不压身
        </h2>
        <div class="overflow-hidden py-16 relative">
          <div class="ml-[-10%] transform -rotate-12 transform-origin-center w-[120%]">
            <div class="flex gap-4 animate-scroll-diagonal w-max">
              <img
                class="bg-slate-100 dark:bg-slate-800 rounded-lg shrink-0 w-16 h-16 object-contain p-3 transition-all hover:-translate-y-2"
                :src="publicAsset('/skills/regex.svg')"
                alt="Regex"
                title="正则表达式" >
              <img
                class="bg-slate-100 dark:bg-slate-800 rounded-lg shrink-0 w-16 h-16 object-contain p-3 transition-all hover:-translate-y-2"
                :src="publicAsset('/skills/c.svg')"
                alt="C"
                title="C" >
              <img
                class="bg-slate-100 dark:bg-slate-800 rounded-lg shrink-0 w-16 h-16 object-contain p-3 transition-all hover:-translate-y-2"
                :src="publicAsset('/skills/cpp.svg')"
                alt="C++"
                title="C++" >
              <img
                class="bg-slate-100 dark:bg-slate-800 rounded-lg shrink-0 w-16 h-16 object-contain p-3 transition-all hover:-translate-y-2"
                :src="publicAsset('/skills/java.svg')"
                alt="Java"
                title="Java" >
              <img
                class="bg-slate-100 dark:bg-slate-800 rounded-lg shrink-0 w-16 h-16 object-contain p-3 transition-all hover:-translate-y-2"
                :src="publicAsset('/skills/sqlite.svg')"
                alt="SQLite"
                title="SQLite" >
              <img
                class="bg-slate-100 dark:bg-slate-800 rounded-lg shrink-0 w-16 h-16 object-contain p-3 transition-all hover:-translate-y-2"
                :src="publicAsset('/skills/mysql.svg')"
                alt="MySQL"
                title="MySQL" >
              <img
                class="bg-slate-100 dark:bg-slate-800 rounded-lg shrink-0 w-16 h-16 object-contain p-3 transition-all hover:-translate-y-2"
                :src="publicAsset('/skills/html.svg')"
                alt="HTML"
                title="HTML" >
              <img
                class="bg-slate-100 dark:bg-slate-800 rounded-lg shrink-0 w-16 h-16 object-contain p-3 transition-all hover:-translate-y-2"
                :src="publicAsset('/skills/css.svg')"
                alt="CSS"
                title="CSS" >
              <img
                class="bg-slate-100 dark:bg-slate-800 rounded-lg shrink-0 w-16 h-16 object-contain p-3 transition-all hover:-translate-y-2"
                :src="publicAsset('/skills/js.svg')"
                alt="JavaScript"
                title="JavaScript" >
              <img
                class="bg-slate-100 dark:bg-slate-800 rounded-lg shrink-0 w-16 h-16 object-contain p-3 transition-all hover:-translate-y-2"
                :src="publicAsset('/skills/php.svg')"
                alt="PHP"
                title="PHP" >
              <img
                class="bg-slate-100 dark:bg-slate-800 rounded-lg shrink-0 w-16 h-16 object-contain p-3 transition-all hover:-translate-y-2"
                :src="publicAsset('/skills/md.svg')"
                alt="Markdown"
                title="Markdown" >
              <img
                class="bg-slate-100 dark:bg-slate-800 rounded-lg shrink-0 w-16 h-16 object-contain p-3 transition-all hover:-translate-y-2"
                :src="publicAsset('/skills/latex.svg')"
                alt="LaTeX"
                title="LaTeX" >
              <img
                class="bg-slate-100 dark:bg-slate-800 rounded-lg shrink-0 w-16 h-16 object-contain p-3 transition-all hover:-translate-y-2"
                :src="publicAsset('/skills/python.svg')"
                alt="Python"
                title="Python" >
              <img
                class="bg-slate-100 dark:bg-slate-800 rounded-lg shrink-0 w-16 h-16 object-contain p-3 transition-all hover:-translate-y-2"
                :src="publicAsset('/skills/qt.svg')"
                alt="Qt"
                title="Qt" >
              <img
                class="bg-slate-100 dark:bg-slate-800 rounded-lg shrink-0 w-16 h-16 object-contain p-3 transition-all hover:-translate-y-2"
                :src="publicAsset('/skills/regex.svg')"
                alt="Regex"
                title="正则表达式" >
              <img
                class="bg-slate-100 dark:bg-slate-800 rounded-lg shrink-0 w-16 h-16 object-contain p-3 transition-all hover:-translate-y-2"
                :src="publicAsset('/skills/c.svg')"
                alt="C"
                title="C" >
              <img
                class="bg-slate-100 dark:bg-slate-800 rounded-lg shrink-0 w-16 h-16 object-contain p-3 transition-all hover:-translate-y-2"
                :src="publicAsset('/skills/cpp.svg')"
                alt="C++"
                title="C++" >
              <img
                class="bg-slate-100 dark:bg-slate-800 rounded-lg shrink-0 w-16 h-16 object-contain p-3 transition-all hover:-translate-y-2"
                :src="publicAsset('/skills/java.svg')"
                alt="Java"
                title="Java" >
              <img
                class="bg-slate-100 dark:bg-slate-800 rounded-lg shrink-0 w-16 h-16 object-contain p-3 transition-all hover:-translate-y-2"
                :src="publicAsset('/skills/sqlite.svg')"
                alt="SQLite"
                title="SQLite" >
              <img
                class="bg-slate-100 dark:bg-slate-800 rounded-lg shrink-0 w-16 h-16 object-contain p-3 transition-all hover:-translate-y-2"
                :src="publicAsset('/skills/mysql.svg')"
                alt="MySQL"
                title="MySQL" >
              <img
                class="bg-slate-100 dark:bg-slate-800 rounded-lg shrink-0 w-16 h-16 object-contain p-3 transition-all hover:-translate-y-2"
                :src="publicAsset('/skills/html.svg')"
                alt="HTML"
                title="HTML" >
              <img
                class="bg-slate-100 dark:bg-slate-800 rounded-lg shrink-0 w-16 h-16 object-contain p-3 transition-all hover:-translate-y-2"
                :src="publicAsset('/skills/css.svg')"
                alt="CSS"
                title="CSS" >
              <img
                class="bg-slate-100 dark:bg-slate-800 rounded-lg shrink-0 w-16 h-16 object-contain p-3 transition-all hover:-translate-y-2"
                :src="publicAsset('/skills/js.svg')"
                alt="JavaScript"
                title="JavaScript" >
              <img
                class="bg-slate-100 dark:bg-slate-800 rounded-lg shrink-0 w-16 h-16 object-contain p-3 transition-all hover:-translate-y-2"
                :src="publicAsset('/skills/php.svg')"
                alt="PHP"
                title="PHP" >
              <img
                class="bg-slate-100 dark:bg-slate-800 rounded-lg shrink-0 w-16 h-16 object-contain p-3 transition-all hover:-translate-y-2"
                :src="publicAsset('/skills/md.svg')"
                alt="Markdown"
                title="Markdown" >
              <img
                class="bg-slate-100 dark:bg-slate-800 rounded-lg shrink-0 w-16 h-16 object-contain p-3 transition-all hover:-translate-y-2"
                :src="publicAsset('/skills/latex.svg')"
                alt="LaTeX"
                title="LaTeX" >
              <img
                class="bg-slate-100 dark:bg-slate-800 rounded-lg shrink-0 w-16 h-16 object-contain p-3 transition-all hover:-translate-y-2"
                :src="publicAsset('/skills/python.svg')"
                alt="Python"
                title="Python" >
              <img
                class="bg-slate-100 dark:bg-slate-800 rounded-lg shrink-0 w-16 h-16 object-contain p-3 transition-all hover:-translate-y-2"
                :src="publicAsset('/skills/qt.svg')"
                alt="Qt"
                title="Qt" >
            </div>
          </div>
        </div>
      </div>

      <!-- 兴趣广泛 -->
      <div class="ready ml-[5%] mb-24 max-md:ml-0">
        <div class="text-blue-600 dark:text-blue-400 text-xs font-bold mb-2 transition-colors duration-300">03</div>
        <h2
          class="text-slate-900 dark:text-slate-100 text-[clamp(2rem,5vw,3.5rem)] font-extrabold tracking-tight leading-none mb-8 transition-colors duration-300">
          兴趣广泛
        </h2>
        <div class="flex flex-wrap gap-4 pt-3">
          <div class="bg-slate-100 dark:bg-slate-800 rounded-lg p-6 text-center transition-all w-20 hover:-translate-y-2 duration-300">
            <span class="block text-2xl mb-2">💻</span>
            <span
              class="text-slate-800 dark:text-slate-200 font-medium [text-orientation:mixed] [writing-mode:vertical-rl] transition-colors duration-300"
              >编程</span
            >
          </div>
          <div class="bg-slate-100 dark:bg-slate-800 rounded-lg p-6 text-center transition-all w-20 hover:-translate-y-2 duration-300">
            <span class="block text-2xl mb-2">🎮</span>
            <span
              class="text-slate-800 dark:text-slate-200 font-medium [text-orientation:mixed] [writing-mode:vertical-rl] transition-colors duration-300"
              >游戏</span
            >
          </div>
          <div class="bg-slate-100 dark:bg-slate-800 rounded-lg p-6 text-center transition-all w-20 hover:-translate-y-2 duration-300">
            <span class="block text-2xl mb-2">🎸</span>
            <span
              class="text-slate-800 dark:text-slate-200 font-medium [text-orientation:mixed] [writing-mode:vertical-rl] transition-colors duration-300"
              >音乐</span
            >
          </div>
          <div class="bg-slate-100 dark:bg-slate-800 rounded-lg p-6 text-center transition-all w-20 hover:-translate-y-2 duration-300">
            <span class="block text-2xl mb-2">📸</span>
            <span
              class="text-slate-800 dark:text-slate-200 font-medium [text-orientation:mixed] [writing-mode:vertical-rl] transition-colors duration-300"
              >摄影</span
            >
          </div>
          <div class="bg-slate-100 dark:bg-slate-800 rounded-lg p-6 text-center transition-all w-20 hover:-translate-y-2 duration-300">
            <span class="block text-2xl mb-2">📚</span>
            <span
              class="text-slate-800 dark:text-slate-200 font-medium [text-orientation:mixed] [writing-mode:vertical-rl] transition-colors duration-300"
              >阅读</span
            >
          </div>
          <div class="bg-slate-100 dark:bg-slate-800 rounded-lg p-6 text-center transition-all w-20 hover:-translate-y-2 duration-300">
            <span class="block text-2xl mb-2">✈️</span>
            <span
              class="text-slate-800 dark:text-slate-200 font-medium [text-orientation:mixed] [writing-mode:vertical-rl] transition-colors duration-300"
              >旅行</span
            >
          </div>
        </div>
      </div>

      <!-- 16 Personality -->
      <div class="ready ml-[40%] mb-24 max-md:ml-0">
        <div class="text-blue-600 dark:text-blue-400 text-xs font-bold mb-2 transition-colors duration-300">04</div>
        <h2
          class="text-slate-900 dark:text-slate-100 text-[clamp(2rem,5vw,3.5rem)] font-extrabold tracking-tight leading-none mb-8 transition-colors duration-300">
          16 Personality
        </h2>
        <div class="bg-slate-100 dark:bg-slate-800 rounded-2xl p-8 transition-colors duration-300">
          <div class="flex items-center gap-8 mb-8">
            <div class="shrink-0 max-sm:hidden">
              <img :src="publicAsset('/imgs/enfj.svg')" alt="ENTJ" class="w-32 h-32 object-contain" >
            </div>
            <div class="flex-1">
              <div class="text-slate-900 dark:text-slate-100 text-xl font-bold mb-2 transition-colors duration-300">主人公 · ENTJ-A</div>
              <div class="text-slate-600 dark:text-slate-400 mb-4 transition-colors duration-300">外向 · 思维 · 展望</div>
              <div class="flex flex-wrap gap-2">
                <span
                  class="bg-slate-200 dark:bg-slate-700 text-slate-600 dark:text-slate-300 rounded-lg text-sm px-3 py-1 transition-colors duration-300"
                  >完美主义</span
                >
                <span
                  class="bg-slate-200 dark:bg-slate-700 text-slate-600 dark:text-slate-300 rounded-lg text-sm px-3 py-1 transition-colors duration-300"
                  >志向</span
                >
                <span
                  class="bg-slate-200 dark:bg-slate-700 text-slate-600 dark:text-slate-300 rounded-lg text-sm px-3 py-1 transition-colors duration-300"
                  >内在动力</span
                >
                <span
                  class="bg-slate-200 dark:bg-slate-700 text-slate-600 dark:text-slate-300 rounded-lg text-sm px-3 py-1 transition-colors duration-300"
                  >领导欲望</span
                >
              </div>
            </div>
          </div>
          <div class="stats-mbti-bars grid gap-4">
            <div class="flex items-center gap-4">
              <div class="text-slate-600 dark:text-slate-400 text-sm w-16 transition-colors duration-300">外向</div>
              <div class="bg-slate-200 dark:bg-slate-700 rounded-full flex-1 h-2 overflow-hidden transition-colors duration-300">
                <div
                  class="bg-blue-600 dark:bg-blue-400 rounded-full h-full transition-all duration-1000"
                  :style="{ width: animatedMbtiData.extroversion + '%' }"/>
              </div>
              <div class="text-slate-800 dark:text-slate-200 text-sm font-semibold text-right w-12 transition-colors duration-300">
                {{ animatedMbtiData.extroversion }}%
              </div>
            </div>
            <div class="flex items-center gap-4">
              <div class="text-slate-600 dark:text-slate-400 text-sm w-16 transition-colors duration-300">天马行空</div>
              <div class="bg-slate-200 dark:bg-slate-700 rounded-full flex-1 h-2 overflow-hidden transition-colors duration-300">
                <div
                  class="bg-blue-600 dark:bg-blue-400 rounded-full h-full transition-all duration-1000"
                  :style="{ width: animatedMbtiData.intuition + '%' }"/>
              </div>
              <div class="text-slate-800 dark:text-slate-200 text-sm font-semibold text-right w-12 transition-colors duration-300">
                {{ animatedMbtiData.intuition }}%
              </div>
            </div>
            <div class="flex items-center gap-4">
              <div class="text-slate-600 dark:text-slate-400 text-sm w-16 transition-colors duration-300">情感细腻</div>
              <div class="bg-slate-200 dark:bg-slate-700 rounded-full flex-1 h-2 overflow-hidden transition-colors duration-300">
                <div
                  class="bg-blue-600 dark:bg-blue-400 rounded-full h-full transition-all duration-1000"
                  :style="{ width: animatedMbtiData.thinking + '%' }"/>
              </div>
              <div class="text-slate-800 dark:text-slate-200 text-sm font-semibold text-right w-12 transition-colors duration-300">
                {{ animatedMbtiData.thinking }}%
              </div>
            </div>
            <div class="flex items-center gap-4">
              <div class="text-slate-600 dark:text-slate-400 text-sm w-16 transition-colors duration-300">运筹帷幄</div>
              <div class="bg-slate-200 dark:bg-slate-700 rounded-full flex-1 h-2 overflow-hidden transition-colors duration-300">
                <div
                  class="bg-blue-600 dark:bg-blue-400 rounded-full h-full transition-all duration-1000"
                  :style="{ width: animatedMbtiData.prospecting + '%' }"/>
              </div>
              <div class="text-slate-800 dark:text-slate-200 text-sm font-semibold text-right w-12 transition-colors duration-300">
                {{ animatedMbtiData.prospecting }}%
              </div>
            </div>
            <div class="flex items-center gap-4">
              <div class="text-slate-600 dark:text-slate-400 text-sm w-16 transition-colors duration-300">自信果断</div>
              <div class="bg-slate-200 dark:bg-slate-700 rounded-full flex-1 h-2 overflow-hidden transition-colors duration-300">
                <div
                  class="bg-blue-600 dark:bg-blue-400 rounded-full h-full transition-all duration-1000"
                  :style="{ width: animatedMbtiData.assertive + '%' }"/>
              </div>
              <div class="text-slate-800 dark:text-slate-200 text-sm font-semibold text-right w-12 transition-colors duration-300">
                {{ animatedMbtiData.assertive }}%
              </div>
            </div>
          </div>
          <a
            href="https://www.16personalities.com/ch/entp-%E4%BA%BA%E6%A0%BC"
            target="_blank"
            class="flex items-center bg-blue-600 dark:bg-blue-500 rounded-full text-white font-semibold gap-2 mt-6 px-6 py-3 transition-all duration-200 w-fit hover:bg-blue-500 dark:hover:bg-blue-400">
            了解更多 <Icon name="ri:arrow-right-line" class="size-4" />
          </a>
        </div>
      </div>

      <!-- 站点统计 -->
      <div class="ready ml-[5%] mb-24 max-md:ml-0">
        <div class="text-blue-600 dark:text-blue-400 text-xs font-bold mb-2 transition-colors duration-300">05</div>
        <h2
          class="text-slate-900 dark:text-slate-100 text-[clamp(2rem,5vw,3.5rem)] font-extrabold tracking-tight leading-none mb-8 transition-colors duration-300">
          站点统计
        </h2>
        <div class="stats-grid grid grid-cols-1 md:grid-cols-4 gap-4 max-md:grid-cols-2">
          <div class="text-center">
            <div class="text-blue-600 dark:text-blue-400 text-3xl font-black leading-none mb-2 transition-colors duration-300">
              {{ animatedStats.publishedPostsNum }}
            </div>
            <div class="text-slate-600 dark:text-slate-400 text-xs tracking-widest uppercase transition-colors duration-300">文章</div>
          </div>
          <div class="text-center">
            <div class="text-blue-600 dark:text-blue-400 text-3xl font-black leading-none mb-2 transition-colors duration-300">
              {{ animatedStats.publishedCommentsNum }}
            </div>
            <div class="text-slate-600 dark:text-slate-400 text-xs tracking-widest uppercase transition-colors duration-300">评论</div>
          </div>
          <div class="text-center">
            <div class="text-blue-600 dark:text-blue-400 text-3xl font-black leading-none mb-2 transition-colors duration-300">
              {{ animatedStats.categoriesNum }}
            </div>
            <div class="text-slate-600 dark:text-slate-400 text-xs tracking-widest uppercase transition-colors duration-300">分类</div>
          </div>
          <div class="text-center">
            <div class="text-blue-600 dark:text-blue-400 text-3xl font-black leading-none mb-2 transition-colors duration-300">
              {{ animatedStats.tagsNum }}
            </div>
            <div class="text-slate-600 dark:text-slate-400 text-xs tracking-widest uppercase transition-colors duration-300">标签</div>
          </div>
        </div>
      </div>

      <!-- 交个朋友 -->
      <div class="ready ml-[50%] mb-24 max-md:ml-0">
        <div class="text-blue-600 dark:text-blue-400 text-xs font-bold mb-2 transition-colors duration-300">06</div>
        <h2
          class="text-slate-900 dark:text-slate-100 text-[clamp(2rem,5vw,3.5rem)] font-extrabold tracking-tight leading-none mb-8 transition-colors duration-300">
          交个朋友
        </h2>
        <p class="text-slate-600 dark:text-slate-400 text-lg mb-6 transition-colors duration-300">欢迎与我交流技术和生活</p>
        <div class="flex flex-wrap gap-4">
          <a
            :href="siteConfig.social.find(item => item.name === '邮箱')?.link || '#'"
            class="flex items-center bg-blue-600 dark:bg-blue-500 border border-slate-200 dark:border-slate-700 rounded-full text-white font-semibold gap-3 px-8 py-4 transition-all duration-200 hover:bg-blue-500 dark:hover:bg-blue-400 hover:shadow">
            <Icon name="ri:mail-line" class="size-4 text-white" mode="svg" />
            发邮件
          </a>
          <a
            :href="siteConfig.social.find(item => item.name === '个人网站')?.link || '#'"
            target="_blank"
            class="flex items-center bg-slate-100 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-full text-slate-800 dark:text-slate-200 font-semibold gap-3 px-8 py-4 transition-all duration-200 hover:bg-blue-600 dark:hover:bg-blue-500 hover:shadow hover:text-white group">
            <Icon
              name="ri:home-line"
              class="transition-all duration-200 size-4 text-slate-600 dark:text-slate-400 group-hover:text-white"
              mode="svg" />
            主页
          </a>
          <a
            :href="siteConfig.social.find(item => item.name === 'Github')?.link || '#'"
            target="_blank"
            class="flex items-center bg-slate-100 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-full text-slate-800 dark:text-slate-200 font-semibold gap-3 px-8 py-4 transition-all duration-200 hover:bg-blue-600 dark:hover:bg-blue-500 hover:shadow hover:text-white group">
            <Icon
              name="ri:github-line"
              class="transition-all duration-200 size-4 text-slate-600 dark:text-slate-400 group-hover:text-white"
              mode="svg" />
            GitHub
          </a>
        </div>
      </div>

      <!-- 引言 -->
      <div class="ready my-24 py-16 relative">
        <div class="text-slate-900 dark:text-slate-100 text-2xl font-bold leading-relaxed max-w-2xl pl-12 relative transition-colors duration-300">
          <div class="absolute -top-36 left-0 text-[12em] text-slate-200 dark:text-slate-700 size-fit -z-1 opacity-55 transition-colors duration-300">
            "
          </div>
          山海寻梦，不觉其远<br >前路迢迢，阔步而行
        </div>
        <div class="text-slate-600 dark:text-slate-400 mt-6 pl-12 relative transition-colors duration-300">—— 习近平 · 二〇二六年新年贺词</div>
      </div>

      <!-- 导航 -->
      <div class="ready mb-24">
        <div class="grid grid-cols-1 md:grid-cols-3 gap-6 max-md:grid-cols-1">
          <NuxtLink
            href="/archiving"
            class="group bg-slate-100 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-2xl p-10 transition-all duration-300 hover:bg-white dark:hover:bg-slate-700 hover:border-blue-500 hover:shadow-xl hover:shadow-blue-500/10">
            <div
              class="flex items-center justify-center bg-slate-200 dark:bg-slate-700 rounded-lg text-blue-600 dark:text-blue-400 text-2xl w-16 h-16 mb-16 transition-all duration-300 group-hover:bg-blue-600 group-hover:text-white dark:group-hover:bg-blue-500 group-hover:scale-110">
              <Icon name="ri:archive-line" class="size-8" mode="svg" />
            </div>
            <div
              class="text-slate-800 dark:text-slate-200 text-xl font-bold mb-1 transition-colors duration-300 group-hover:text-blue-600 dark:group-hover:text-blue-400">
              文章归档
            </div>
            <div class="text-slate-600 dark:text-slate-400 text-sm transition-colors duration-300">浏览所有文章</div>
          </NuxtLink>
          <NuxtLink
            to="/sitemap"
            class="group bg-slate-100 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-2xl p-10 transition-all duration-300 hover:bg-white dark:hover:bg-slate-700 hover:border-blue-500 hover:shadow-xl hover:shadow-blue-500/10">
            <div
              class="flex items-center justify-center bg-slate-200 dark:bg-slate-700 rounded-lg text-blue-600 dark:text-blue-400 text-2xl w-16 h-16 mb-16 transition-all duration-300 group-hover:bg-blue-600 group-hover:text-white dark:group-hover:bg-blue-500 group-hover:scale-110">
              <Icon name="ri:compass-line" class="size-8" mode="svg" />
            </div>
            <div
              class="text-slate-800 dark:text-slate-200 text-xl font-bold mb-1 transition-colors duration-300 group-hover:text-blue-600 dark:group-hover:text-blue-400">
              站点地图
            </div>
            <div class="text-slate-600 dark:text-slate-400 text-sm transition-colors duration-300">探索本站结构</div>
          </NuxtLink>
          <NuxtLink
            to="/changelogs"
            class="group bg-slate-100 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-2xl p-10 transition-all duration-300 hover:bg-white dark:hover:bg-slate-700 hover:border-blue-500 hover:shadow-xl hover:shadow-blue-500/10">
            <div
              class="flex items-center justify-center bg-slate-200 dark:bg-slate-700 rounded-lg text-blue-600 dark:text-blue-400 text-2xl w-16 h-16 mb-16 transition-all duration-300 group-hover:bg-blue-600 group-hover:text-white dark:group-hover:bg-blue-500 group-hover:scale-110">
              <Icon name="ri:edit-line" class="size-8" mode="svg" />
            </div>
            <div
              class="text-slate-800 dark:text-slate-200 text-xl font-bold mb-1 transition-colors duration-300 group-hover:text-blue-600 dark:group-hover:text-blue-400">
              更新日志
            </div>
            <div class="text-slate-600 dark:text-slate-400 text-sm transition-colors duration-300">不断优化主题</div>
          </NuxtLink>
        </div>
      </div>

      <!-- 十年之约履约进度 -->
      <div class="ready ml-[5%] mb-24 max-md:ml-0">
        <h2
          class="text-slate-900 dark:text-slate-100 text-[clamp(2rem,5vw,3.5rem)] font-extrabold tracking-tight leading-none mb-4 transition-colors duration-300">
          十年之约
        </h2>
        <p class="text-slate-600 dark:text-slate-400 text-lg mb-8 transition-colors duration-300">承诺让这个博客持续生长十年，不弃更、不关站</p>
        <div class="pledge-card">
          <div class="flex items-end justify-between mb-3">
            <div>
              <div class="text-blue-600 dark:text-blue-400 text-4xl font-black leading-none transition-colors duration-300">
                {{ animatedPledge.days }}<span class="text-base font-medium text-slate-500 dark:text-slate-400 ml-1">天</span>
              </div>
              <div class="text-slate-500 dark:text-slate-400 text-xs tracking-widest uppercase mt-2 transition-colors duration-300">
                已履约 / 目标 {{ pledgeTotalDays }} 天
              </div>
            </div>
            <div class="text-right">
              <div class="text-slate-900 dark:text-slate-100 text-2xl font-bold transition-colors duration-300">{{ animatedPledge.percent }}%</div>
              <div class="text-slate-500 dark:text-slate-400 text-xs mt-2 transition-colors duration-300">
                {{ pledgeFormattedDate(pledgeStartDate) }} → {{ pledgeFormattedDate(pledgeEndDate) }}
              </div>
            </div>
          </div>
          <div class="bg-slate-200 dark:bg-slate-700 rounded-full h-3 overflow-hidden transition-colors duration-300">
            <div
              class="bg-blue-600 dark:bg-blue-400 h-full rounded-full transition-all duration-1800 ease-out"
              :style="{ width: pledgeBarWidth + '%' }"/>
          </div>
        </div>
        <a
          :href="tenYearPledgeUrl"
          target="_blank"
          rel="noopener noreferrer"
          class="inline-flex items-center gap-1 text-blue-600 dark:text-blue-400 hover:underline text-sm mt-6 transition-colors duration-300">
          看看我的大事记
          <Icon name="ri:arrow-right-line" class="size-4" />
        </a>
      </div>

      <!-- 更多故事 -->
      <div class="ready border-t-2 border-slate-200 dark:border-slate-700 mt-32 pt-12 transition-colors duration-300">
        <h2
          class="text-slate-900 dark:text-slate-100 text-[clamp(2.5rem,6vw,4rem)] font-black tracking-tight leading-none mb-12 transition-colors duration-300">
          更多故事
        </h2>
        <div class="text-slate-800 dark:text-slate-200 text-lg leading-relaxed max-w-2xl space-y-8 transition-colors duration-300">
          <!-- 第一节：关于本站 -->
          <div>
            <h3 class="text-2xl font-bold text-slate-900 dark:text-slate-100 mb-4 transition-colors duration-300">关于本站</h3>
            <p class="mb-4 text-slate-700 dark:text-slate-300 transition-colors duration-300">
              这个网站是我庞大信息世界中的一个藏身之所，我喜欢在这里记录我觉得有趣的东西。
            </p>
            <p class="mb-4 text-slate-700 dark:text-slate-300 transition-colors duration-300">
              包括但不限于生活中有趣的事情、好看的景色、游戏，有时还比较关心时事。
            </p>
            <p class="text-slate-700 dark:text-slate-300 transition-colors duration-300">本人热爱代码，所以偶尔也会写点技术文章。</p>
          </div>
          <!-- 第二节：框架？主题？ -->
          <div>
            <h3 class="text-2xl font-bold text-slate-900 dark:text-slate-100 mb-4 transition-colors duration-300">框架？主题？</h3>
            <p class="mb-4 text-slate-700 dark:text-slate-300 transition-colors duration-300">
              你所看到的这一版网站是我制作的第二款主题，第一款框架，整体采用 Nuxt 4 编写，我给这个 CMS 取名为 Glass。
            </p>
            <p class="mb-4 text-slate-700 dark:text-slate-300 transition-colors duration-300"/>
            <p class="mb-4 text-slate-700 dark:text-slate-300 transition-colors duration-300">
              这款主题从 2026 年 4 月 1 日开始制作，保留了之前 Typecho 版本的绝大多数功能，可以让我在更改技术栈的同时，继续使用之前的功能。
            </p>
            <p class="text-slate-700 dark:text-slate-300 transition-colors duration-300">本主题不开源。</p>
          </div>
        </div>
      </div>
    </div>

    <div class="my-24 mx-4 w-px"/>
  </div>
</template>

<script setup lang="ts">
import { onMounted, ref } from "vue";

import { siteConfig } from "~~/site.config";

// 使用全局站点设置
const { siteSettings } = useSiteSettings();
const siteName = computed(() => siteSettings.value?.siteName || siteConfig.siteName);

// 十年之约入口链接（取自 site.config.ts 的 blogOrganizations，避免硬编码）
const tenYearPledgeUrl = computed(() => siteConfig.links.blogOrganizations.find(o => o.name === "十年之约")?.url || "https://www.foreverblog.cn/");

// 装饰性品牌文字（站点域名大写形式）
const brandDomain = new URL(siteConfig.siteUrl).host.toUpperCase();

// 注入页面加载状态
const pageLoading = inject<Ref<boolean>>("pageLoading", ref(false));

// 获取统计数据
const { data: statsData } = await useFetch("/api/stats", {
  headers: {
    "x-ssr-internal-request": "true",
  },
});
const stats = computed(() => ({
  publishedPostsNum: statsData.value?.data?.publishedPostsNum || 0,
  publishedCommentsNum: statsData.value?.data?.publishedCommentsNum || 0,
  categoriesNum: statsData.value?.data?.categoriesNum || 0,
  tagsNum: statsData.value?.data?.tagsNum || 0,
}));

// 页面元数据
usePageSeo({
  title: computed(() => `关于 - ${siteName.value}`),
  description: siteConfig.pageSeo.about.description,
  keywords: siteConfig.pageSeo.about.keywords,
});

// 动画用的统计数据
const animatedStats = ref({
  publishedPostsNum: 0,
  publishedCommentsNum: 0,
  categoriesNum: 0,
  tagsNum: 0,
});

// MBTI数据
const mbtiData = ref({
  extroversion: 70,
  intuition: 51,
  thinking: 53,
  prospecting: 71,
  assertive: 76,
});

// MBTI动画数据
const animatedMbtiData = ref({
  extroversion: 0,
  intuition: 0,
  thinking: 0,
  prospecting: 0,
  assertive: 0,
});

// 十年之约履约进度
const pledgeStartDate = new Date("2024-07-21");
const pledgeEndDate = new Date(pledgeStartDate.getFullYear() + 10, pledgeStartDate.getMonth(), pledgeStartDate.getDate());
const pledgeTotalDays = Math.max(1, Math.round((pledgeEndDate.getTime() - pledgeStartDate.getTime()) / 86400000));
const pledgeElapsedDays = computed(() => Math.max(0, Math.min(pledgeTotalDays, Math.floor((Date.now() - pledgeStartDate.getTime()) / 86400000))));
const pledgePercent = computed(() => Math.round((pledgeElapsedDays.value / pledgeTotalDays) * 100));
const pledgeFormattedDate = (d: Date) => `${d.getFullYear()}.${String(d.getMonth() + 1).padStart(2, "0")}.${String(d.getDate()).padStart(2, "0")}`;
const animatedPledge = ref({ days: 0, percent: 0 });
const pledgeBarWidth = ref(0);

// 数字动画函数
const animateNumber = (from: number, to: number, duration: number, callback: (value: number) => void) => {
  const start = performance.now();
  let current = from;
  const range = to - from;

  const updateNumber = (timestamp: number) => {
    const elapsed = timestamp - start;
    const progress = Math.min(elapsed / duration, 1);
    // 使用缓动函数
    const easeProgress = 1 - Math.pow(1 - progress, 3);
    current = Math.floor(from + range * easeProgress);
    callback(current);

    if (progress < 1) {
      requestAnimationFrame(updateNumber);
    }
  };

  requestAnimationFrame(updateNumber);
};

// 滚动动画
let scrollObserver: IntersectionObserver | null = null;

onMounted(() => {
  // 立即检查首屏元素
  const checkInitialElements = () => {
    const elements = document.querySelectorAll(".ready");
    elements.forEach(el => {
      const rect = el.getBoundingClientRect();
      // 检查元素是否在视口内
      const isInViewport =
        rect.top >= 0 &&
        rect.left >= 0 &&
        rect.bottom <= (window.innerHeight || document.documentElement.clientHeight) &&
        rect.right <= (window.innerWidth || document.documentElement.clientWidth);

      if (isInViewport) {
        el.classList.add("fadeIn");
        // 立即移除ready类，避免透明度为0的问题
        setTimeout(() => {
          el.classList.remove("ready");
        }, 50);

        // 站点统计数字动画
        if (el.querySelector(".stats-grid")) {
          animateNumber(0, stats.value.publishedPostsNum, 2000, value => {
            animatedStats.value.publishedPostsNum = value;
          });
          animateNumber(0, stats.value.publishedCommentsNum, 2000, value => {
            animatedStats.value.publishedCommentsNum = value;
          });
          animateNumber(0, stats.value.categoriesNum, 2000, value => {
            animatedStats.value.categoriesNum = value;
          });
          animateNumber(0, stats.value.tagsNum, 2000, value => {
            animatedStats.value.tagsNum = value;
          });
        }

        // MBTI进度条动画
        if (el.querySelector(".stats-mbti-bars")) {
          setTimeout(() => {
            animatedMbtiData.value = { ...mbtiData.value };
          }, 300);
        }

        // 十年之约履约进度动画
        if (el.querySelector(".pledge-card")) {
          animateNumber(0, pledgeElapsedDays.value, 2000, value => {
            animatedPledge.value.days = value;
          });
          animateNumber(0, pledgePercent.value, 2000, value => {
            animatedPledge.value.percent = value;
          });
          setTimeout(() => {
            pledgeBarWidth.value = pledgePercent.value;
          }, 100);
        }
      }
    });
  };

  // 等待页面过渡完成后再执行元素动画
  const initAnimations = () => {
    if (pageLoading.value) {
      // 页面还在加载中，等待100ms后再检查
      setTimeout(initAnimations, 100);
    } else {
      // 页面加载完成，执行首屏检查
      checkInitialElements();

      // 继续使用IntersectionObserver监听滚动
      scrollObserver = new IntersectionObserver(
        entries => {
          entries.forEach(entry => {
            if (entry.isIntersecting && entry.target.classList.contains("ready")) {
              entry.target.classList.add("fadeIn");

              // 监听动画完成事件，移除ready类
              entry.target.addEventListener(
                "animationend",
                () => {
                  entry.target.classList.remove("ready");
                },
                { once: true },
              );

              // 站点统计数字动画
              if (entry.target.querySelector(".stats-grid")) {
                animateNumber(0, stats.value.publishedPostsNum, 2000, value => {
                  animatedStats.value.publishedPostsNum = value;
                });
                animateNumber(0, stats.value.publishedCommentsNum, 2000, value => {
                  animatedStats.value.publishedCommentsNum = value;
                });
                animateNumber(0, stats.value.categoriesNum, 2000, value => {
                  animatedStats.value.categoriesNum = value;
                });
                animateNumber(0, stats.value.tagsNum, 2000, value => {
                  animatedStats.value.tagsNum = value;
                });
              }

              // MBTI进度条动画
              if (entry.target.querySelector(".stats-mbti-bars")) {
                setTimeout(() => {
                  animatedMbtiData.value = { ...mbtiData.value };
                }, 300);
              }

              // 十年之约履约进度动画
              if (entry.target.querySelector(".pledge-card")) {
                animateNumber(0, pledgeElapsedDays.value, 2000, value => {
                  animatedPledge.value.days = value;
                });
                animateNumber(0, pledgePercent.value, 2000, value => {
                  animatedPledge.value.percent = value;
                });
                setTimeout(() => {
                  pledgeBarWidth.value = pledgePercent.value;
                }, 100);
              }
            }
          });
        },
        {
          threshold: 0.1,
        },
      );

      document.querySelectorAll(".ready").forEach(el => {
        scrollObserver?.observe(el);
      });
    }
  };

  // 启动动画初始化
  initAnimations();
});

onUnmounted(() => {
  scrollObserver?.disconnect();
});
</script>

<style scoped>
/* 滚动动画 */
.ready {
  opacity: 0;
}

.fadeIn {
  animation: slideUp 0.4s cubic-bezier(0.4, 0, 0.2, 1);
  animation-fill-mode: backwards;
}

@keyframes slideUp {
  0% {
    opacity: 0;
    transform: translateY(30px);
  }
  to {
    opacity: 1;
    transform: translateY(0);
  }
}

/* 技能滚动动画 */
@keyframes scrollDiagonal {
  0% {
    transform: translateX(0);
  }
  to {
    transform: translateX(-50%);
  }
}

.animate-scroll-diagonal {
  animation: scrollDiagonal 20s linear infinite;
}

.animate-scroll-diagonal:hover {
  animation-play-state: paused;
}
</style>
