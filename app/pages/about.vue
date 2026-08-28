<template>
  <div class="m-auto max-w-7xl min-h-screen overflow-x-hidden relative w-full">
    <div
      class="bottom-0 text-slate-100 dark:text-slate-800 text-[clamp(4rem,12vw,16rem)] font-extrabold left-[3%] tracking-tighter leading-[.8] fixed [text-orientation:mixed] select-none [writing-mode:sideways-lr] z-0 transition-colors duration-300">
      <h1 id="about-page-title" class="sr-only">关于我</h1>
      {{ brandDomain }}
    </div>

    <!-- Inspira UI 交互式网格（右下角固定装饰） -->
    <div
      class="fixed right-0 bottom-0 z-0 h-[min(60vh,520px)] w-[min(60vw,520px)] mask-[radial-gradient(ellipse_at_bottom_right,black_40%,transparent_78%)]">
      <InteractiveGridPattern class="h-full w-full border-none" :squares="[20, 20]" />
    </div>

    <div class="p-10 md:p-6 max-sm:p-4 relative z-10 pointer-events-none about-pass-through">
      <!-- 头部区域 -->
      <div class="ready grid grid-cols-1 md:grid-cols-2 gap-16 items-end mb-32 max-md:gap-32">
        <div class="pl-8">
          <div
            class="w-48 h-48 rounded-full border-6 border-slate-100 dark:border-slate-700 shadow-lg overflow-hidden mb-8 transition-colors duration-300">
            <img :src="siteConfig.siteAvatarPath" :alt="siteConfig.ownerName" class="w-full h-full object-cover" >
          </div>
          <div
            class="text-slate-900 dark:text-slate-100 text-[clamp(3rem,8vw,6rem)] font-black tracking-tight leading-[.9] mb-4 transition-colors duration-300">
            {{ siteConfig.ownerName }}
          </div>
          <p class="text-slate-600 dark:text-slate-400 text-lg leading-relaxed max-w-xs transition-colors duration-300">
            {{ siteConfig.links.profile.siteDescription }}
          </p>
        </div>
        <div class="pb-8 text-right max-md:text-left">
          <div class="text-blue-600 dark:text-blue-400 text-xs tracking-widest mb-4 uppercase transition-colors duration-300">ABOUT ME</div>
          <div class="text-slate-800 dark:text-slate-200 text-2xl font-medium leading-relaxed mb-8 transition-colors duration-300">
            我热爱编程，喜欢记录生活，分享有趣的事情。这是我的个人博客，记录着技术、生活和思考。
          </div>
          <div class="pointer-events-auto flex justify-end max-md:justify-start">
            <div
              class="profile-tag-carousel relative min-h-10 min-w-36 overflow-hidden rounded-full border border-slate-200 bg-slate-100 px-4 py-2 dark:border-slate-700 dark:bg-slate-800 transition-colors duration-300"
              @mouseenter="stopProfileTagCarousel"
              @mouseleave="startProfileTagCarousel"
              @focusin="stopProfileTagCarousel"
              @focusout="startProfileTagCarousel">
              <Transition name="profile-tag" mode="out-in">
                <span
                  :key="activeProfileTag.label"
                  class="flex items-center justify-center gap-2 text-slate-600 dark:text-slate-400 text-sm transition-colors duration-300">
                  <span>{{ activeProfileTag.icon }}</span>
                  <span>{{ activeProfileTag.label }}</span>
                </span>
              </Transition>
            </div>
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
            <img class="w-full h-full object-cover transition-transform duration-300" :src="publicAsset('/imgs/jixi.webp')" alt="鸡西" >
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
            <img class="w-full h-full object-cover transition-transform duration-300" :src="publicAsset('/imgs/shenyang.webp')" alt="沈阳" >
            <div class="absolute bottom-0 left-0 right-0 bg-linear-to-t from-black/70 to-transparent text-white p-6">
              <div class="text-xs mb-1 opacity-80">现居</div>
              <div class="text-lg font-semibold">辽宁省沈阳市</div>
            </div>
          </div>
        </div>
        <MapEntryLinks :views="['travels']" title="看看我都去过哪里" class="mt-4" />
      </div>

      <!-- 技多不压身 -->
      <div class="ready ml-[32%] mb-24 max-md:ml-0">
        <div class="text-blue-600 dark:text-blue-400 text-xs font-bold mb-2 transition-colors duration-300">02</div>
        <h2
          class="text-slate-900 dark:text-slate-100 text-[clamp(2rem,5vw,3.5rem)] font-extrabold tracking-tight leading-none mb-8 transition-colors duration-300">
          技多不压身
        </h2>
        <div
          class="skill-carousel pointer-events-auto relative overflow-hidden rounded-3xl border border-slate-200 dark:border-slate-700 bg-slate-100/80 dark:bg-slate-800/80 p-3 shadow-xl shadow-blue-500/5 backdrop-blur transition-colors duration-300"
          @mouseenter="stopSkillCarousel"
          @mouseleave="startSkillCarousel"
          @focusin="stopSkillCarousel"
          @focusout="startSkillCarousel">
          <div class="pointer-events-none absolute inset-0 opacity-70">
            <div class="absolute -right-20 -top-24 size-64 rounded-full bg-blue-500/10 blur-3xl"/>
          </div>
          <div class="pointer-events-none absolute right-6 top-6 z-10 hidden md:block">
            <div class="relative flex size-20 items-center justify-center">
              <div class="skill-orbit absolute inset-0 rounded-full border border-blue-500/20 dark:border-blue-400/20"/>
              <span class="relative text-slate-300 dark:text-slate-700 text-4xl font-black leading-none transition-colors duration-300">
                {{ String(activeSkillIndex + 1).padStart(2, "0") }}
              </span>
            </div>
          </div>

          <Transition :name="skillSlideTransitionName" mode="out-in">
            <div :key="activeSkillGroup.key" class="relative p-5 pr-6 md:p-6">
              <div>
                <div class="mb-4 flex items-center gap-3">
                  <span class="h-px w-10 bg-blue-600 dark:bg-blue-400"/>
                  <span class="text-xs font-bold uppercase tracking-[0.28em] text-blue-600 dark:text-blue-400 transition-colors duration-300">
                    {{ activeSkillGroup.eyebrow }}
                  </span>
                </div>
                <div class="mb-4 flex flex-wrap items-end gap-x-4 gap-y-2">
                  <h3 class="text-slate-950 dark:text-slate-50 text-[clamp(2.1rem,5.5vw,4rem)] font-black leading-none tracking-tight transition-colors duration-300">
                    {{ activeSkillGroup.title }}
                  </h3>
                  <span class="rounded-full border border-blue-500/20 bg-white/70 px-3 py-1 text-xs font-semibold text-blue-600 dark:bg-slate-900/40 dark:text-blue-300 transition-colors duration-300">
                    {{ activeSkillGroup.role }}
                  </span>
                </div>
                <p class="mb-6 max-w-xl text-base leading-7 text-slate-600 dark:text-slate-300 transition-colors duration-300">
                  {{ activeSkillGroup.summary }}
                </p>
                <div class="grid min-h-48 grid-cols-2 gap-3 lg:min-h-31 lg:grid-cols-3">
                  <div
                    v-for="stack in activeSkillGroup.stacks"
                    :key="stack.label"
                    class="group flex min-h-14 items-center gap-3 rounded-2xl border border-slate-200 bg-white/80 px-4 py-2.5 text-slate-800 shadow-sm transition-all duration-300 hover:border-blue-500/50 hover:shadow-lg hover:shadow-blue-500/10 dark:border-slate-700 dark:bg-slate-900/40 dark:text-slate-100">
                    <img
                      v-if="stack.icon"
                      :src="publicAsset(stack.icon)"
                      :alt="stack.label"
                      class="no-img-loading size-6 shrink-0 object-contain transition-transform duration-300 group-hover:scale-110" >
                    <span
                      v-else
                      class="flex size-8 shrink-0 items-center justify-center rounded-xl bg-blue-600 text-[0.68rem] font-black uppercase tracking-tight text-white dark:bg-blue-500">
                      {{ stack.mark }}
                    </span>
                    <span class="text-sm font-semibold leading-tight">{{ stack.label }}</span>
                  </div>
                </div>
              </div>
            </div>
          </Transition>

          <div class="relative mt-1 grid grid-cols-1 gap-2 border-t border-slate-200 p-2.5 dark:border-slate-700 md:mt-0 md:grid-cols-[1fr_auto]">
            <div class="grid grid-cols-2 gap-2 sm:grid-cols-4">
              <button
                v-for="(group, index) in skillGroups"
                :key="group.key"
                type="button"
                class="cursor-pointer rounded-2xl px-3 py-2.5 text-left transition-all duration-200 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-blue-500"
                :class="activeSkillIndex === index ? 'bg-blue-600 text-white shadow-lg shadow-blue-500/20 dark:bg-blue-500' : 'text-slate-600 hover:bg-white hover:text-blue-600 dark:text-slate-400 dark:hover:bg-slate-900/50 dark:hover:text-blue-300'"
                :aria-pressed="activeSkillIndex === index"
                @click="selectSkillGroup(index)">
                <span class="block text-sm font-bold">{{ group.tabTitle }}</span>
              </button>
            </div>
            <div class="flex items-center justify-end gap-2 md:pl-2">
              <button
                type="button"
                class="flex size-10 cursor-pointer items-center justify-center rounded-full border border-slate-200 bg-white text-slate-700 transition-all duration-200 hover:border-blue-500 hover:bg-blue-600 hover:text-white focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-blue-500 dark:border-slate-700 dark:bg-slate-900/60 dark:text-slate-200 dark:hover:bg-blue-500"
                aria-label="查看上一个技术方向"
                @click="showPrevSkillGroup">
                <Icon name="ri:arrow-left-line" class="size-5" />
              </button>
              <button
                type="button"
                class="flex size-10 cursor-pointer items-center justify-center rounded-full border border-slate-200 bg-white text-slate-700 transition-all duration-200 hover:border-blue-500 hover:bg-blue-600 hover:text-white focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-blue-500 dark:border-slate-700 dark:bg-slate-900/60 dark:text-slate-200 dark:hover:bg-blue-500"
                aria-label="查看下一个技术方向"
                @click="showNextSkillGroup">
                <Icon name="ri:arrow-right-line" class="size-5" />
              </button>
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
          <div class="interest-card h-32 w-20 perspective-midrange">
            <div class="interest-card-inner relative size-full rounded-lg transition-transform duration-300 transform-3d">
              <div class="absolute inset-0 flex flex-col items-center justify-center rounded-lg bg-slate-100 p-6 text-center transition-colors duration-300 backface-hidden dark:bg-slate-800">
                <span class="mb-2 block text-2xl">💻</span>
                <span class="text-slate-800 dark:text-slate-200 font-medium [text-orientation:mixed] [writing-mode:vertical-rl] transition-colors duration-300">编程</span>
              </div>
              <div class="absolute inset-0 overflow-hidden rounded-lg backface-hidden transform-[rotateY(180deg)]">
                <img :src="publicAsset('/imgs/program.webp')" alt="编程" class="no-img-loading size-full object-cover" >
              </div>
            </div>
          </div>
          <div class="interest-card h-32 w-20 perspective-midrange">
            <div class="interest-card-inner relative size-full rounded-lg transition-transform duration-300 transform-3d">
              <div class="absolute inset-0 flex flex-col items-center justify-center rounded-lg bg-slate-100 p-6 text-center transition-colors duration-300 backface-hidden dark:bg-slate-800">
                <span class="mb-2 block text-2xl">🎮</span>
                <span class="text-slate-800 dark:text-slate-200 font-medium [text-orientation:mixed] [writing-mode:vertical-rl] transition-colors duration-300">游戏</span>
              </div>
              <div class="absolute inset-0 overflow-hidden rounded-lg backface-hidden transform-[rotateY(180deg)]">
                <img :src="publicAsset('/imgs/game.webp')" alt="游戏" class="no-img-loading size-full object-cover" >
              </div>
            </div>
          </div>
          <div class="interest-card h-32 w-20 perspective-midrange">
            <div class="interest-card-inner relative size-full rounded-lg transition-transform duration-300 transform-3d">
              <div class="absolute inset-0 flex flex-col items-center justify-center rounded-lg bg-slate-100 p-6 text-center transition-colors duration-300 backface-hidden dark:bg-slate-800">
                <span class="mb-2 block text-2xl">🎸</span>
                <span class="text-slate-800 dark:text-slate-200 font-medium [text-orientation:mixed] [writing-mode:vertical-rl] transition-colors duration-300">音乐</span>
              </div>
              <div class="absolute inset-0 overflow-hidden rounded-lg backface-hidden transform-[rotateY(180deg)]">
                <img :src="publicAsset('/imgs/music.webp')" alt="音乐" class="no-img-loading size-full object-cover" >
              </div>
            </div>
          </div>
          <div class="interest-card h-32 w-20 perspective-midrange">
            <div class="interest-card-inner relative size-full rounded-lg transition-transform duration-300 transform-3d">
              <div class="absolute inset-0 flex flex-col items-center justify-center rounded-lg bg-slate-100 p-6 text-center transition-colors duration-300 backface-hidden dark:bg-slate-800">
                <span class="mb-2 block text-2xl">📸</span>
                <span class="text-slate-800 dark:text-slate-200 font-medium [text-orientation:mixed] [writing-mode:vertical-rl] transition-colors duration-300">摄影</span>
              </div>
              <div class="absolute inset-0 overflow-hidden rounded-lg backface-hidden transform-[rotateY(180deg)]">
                <img :src="publicAsset('/imgs/photo.webp')" alt="摄影" class="no-img-loading size-full object-cover" >
              </div>
            </div>
          </div>
          <div class="interest-card h-32 w-20 perspective-midrange">
            <div class="interest-card-inner relative size-full rounded-lg transition-transform duration-300 transform-3d">
              <div class="absolute inset-0 flex flex-col items-center justify-center rounded-lg bg-slate-100 p-6 text-center transition-colors duration-300 backface-hidden dark:bg-slate-800">
                <span class="mb-2 block text-2xl">📚</span>
                <span class="text-slate-800 dark:text-slate-200 font-medium [text-orientation:mixed] [writing-mode:vertical-rl] transition-colors duration-300">阅读</span>
              </div>
              <div class="absolute inset-0 overflow-hidden rounded-lg backface-hidden transform-[rotateY(180deg)]">
                <img :src="publicAsset('/imgs/reading.webp')" alt="阅读" class="no-img-loading size-full object-cover" >
              </div>
            </div>
          </div>
          <div class="interest-card h-32 w-20 perspective-midrange">
            <div class="interest-card-inner relative size-full rounded-lg transition-transform duration-300 transform-3d">
              <div class="absolute inset-0 flex flex-col items-center justify-center rounded-lg bg-slate-100 p-6 text-center transition-colors duration-300 backface-hidden dark:bg-slate-800">
                <span class="mb-2 block text-2xl">✈️</span>
                <span class="text-slate-800 dark:text-slate-200 font-medium [text-orientation:mixed] [writing-mode:vertical-rl] transition-colors duration-300">旅行</span>
              </div>
              <div class="absolute inset-0 overflow-hidden rounded-lg backface-hidden transform-[rotateY(180deg)]">
                <img :src="publicAsset('/imgs/travel.webp')" alt="旅行" class="no-img-loading size-full object-cover" >
              </div>
            </div>
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
              <img :src="publicAsset('/imgs/enfj.svg')" alt="ENFJ" class="w-32 h-32 object-contain" >
            </div>
            <div class="flex-1">
              <div class="text-slate-900 dark:text-slate-100 text-xl font-bold mb-2 transition-colors duration-300">主人公 · ENFJ-A</div>
              <div class="text-slate-600 dark:text-slate-400 mb-4 transition-colors duration-300">外向 · 直觉 · 情感 · 判断</div>
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
          <div class="stats-mbti-bars grid gap-6">
            <div v-for="trait in mbtiTraits" :key="trait.key" class="px-0.5">
              <div
                class="relative h-2 rounded"
                :style="{ backgroundColor: trait.color }">
                <div
                  class="absolute top-1/2 -translate-y-1/2 size-3.5 rounded-full border-[2.5px] border-white shadow-[0_1px_2px_rgba(0,0,0,0.15)] transition-all duration-1000 dark:border-slate-800"
                  :style="{ left: animatedMbtiData[trait.key] + '%', backgroundColor: trait.color }">
                  <div class="absolute bottom-full left-1/2 mb-1.5 -translate-x-1/2 whitespace-nowrap text-[11px] font-bold">
                    <span :style="{ color: trait.color }">{{ animatedMbtiData[trait.key] }}%&nbsp;</span>
                    <span class="text-slate-700 dark:text-slate-200">{{ trait.label }}</span>
                  </div>
                </div>
              </div>
              <div class="mt-1 flex justify-between text-xs text-slate-400 dark:text-slate-500">
                <span>{{ trait.opposite }}</span>
                <span class="font-bold text-slate-800 dark:text-slate-100">{{ trait.label }}</span>
              </div>
            </div>
          </div>
          <a
            href="https://www.16personalities.com/ch/enfj-%E4%BA%BA%E6%A0%BC"
            target="_blank"
            class="pointer-events-auto flex items-center bg-blue-600 dark:bg-blue-500 rounded-full text-white font-semibold gap-2 mt-6 px-6 py-3 transition-all duration-200 w-fit hover:bg-blue-500 dark:hover:bg-blue-400">
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
              {{ animatedStats.publishedContentsNum }}
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
        <SiteActivityHeatmap />
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
            class="pointer-events-auto flex items-center bg-blue-600 dark:bg-blue-500 border border-slate-200 dark:border-slate-700 rounded-full text-white font-semibold gap-3 px-8 py-4 transition-all duration-200 hover:bg-blue-500 dark:hover:bg-blue-400 hover:shadow">
            <Icon name="ri:mail-line" class="size-4 text-white" mode="svg" />
            发邮件
          </a>
          <a
            :href="siteConfig.social.find(item => item.name === '个人网站')?.link || '#'"
            target="_blank"
            class="pointer-events-auto flex items-center bg-slate-100 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-full text-slate-800 dark:text-slate-200 font-semibold gap-3 px-8 py-4 transition-all duration-200 hover:bg-blue-600 dark:hover:bg-blue-500 hover:shadow hover:text-white group">
            <Icon
              name="ri:home-line"
              class="transition-all duration-200 size-4 text-slate-600 dark:text-slate-400 group-hover:text-white"
              mode="svg" />
            主页
          </a>
          <a
            :href="siteConfig.social.find(item => item.name === 'Github')?.link || '#'"
            target="_blank"
            class="pointer-events-auto flex items-center bg-slate-100 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-full text-slate-800 dark:text-slate-200 font-semibold gap-3 px-8 py-4 transition-all duration-200 hover:bg-blue-600 dark:hover:bg-blue-500 hover:shadow hover:text-white group">
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
            class="pointer-events-auto group bg-slate-100 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-2xl p-10 transition-all duration-300 hover:bg-white dark:hover:bg-slate-700 hover:border-blue-500 hover:shadow-xl hover:shadow-blue-500/10">
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
            class="pointer-events-auto group bg-slate-100 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-2xl p-10 transition-all duration-300 hover:bg-white dark:hover:bg-slate-700 hover:border-blue-500 hover:shadow-xl hover:shadow-blue-500/10">
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
            class="pointer-events-auto group bg-slate-100 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-2xl p-10 transition-all duration-300 hover:bg-white dark:hover:bg-slate-700 hover:border-blue-500 hover:shadow-xl hover:shadow-blue-500/10">
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
          class="pointer-events-auto inline-flex items-center gap-1 text-blue-600 dark:text-blue-400 hover:underline text-sm mt-6 transition-colors duration-300">
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
              你所看到的这一版网站是我制作的第二款主题，第一款框架，整体采用 Nuxt 4 编写，我给这个 CMS 取名为 ImQi1-CMS。
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

    <!-- 构建哈希（供开发/运维查看） -->
    <div class="pb-6 text-center text-xs text-slate-400 dark:text-slate-500">
      构建哈希：<code class="font-mono">{{ buildHash }}</code>
    </div>
  </div>
</template>

<script setup lang="ts">
import { computed, onMounted, onUnmounted, ref } from "vue";

import type { ProfileTag, SkillGroup } from "~/types/pages/about";
import { siteConfig } from "~~/site.config";

// 使用全局站点设置
const { siteSettings } = useSiteSettings();
const siteName = computed(() => siteSettings.value?.siteName || siteConfig.siteName);

// 当前构建哈希（见 <meta name="build-hash"> 与 window.__BUILD_HASH__）
const buildHash = useRuntimeConfig().public.buildHash;

// 十年之约入口链接（取自 site.config.ts 的 blogOrganizations，避免硬编码）
const tenYearPledgeUrl = computed(() => siteConfig.links.blogOrganizations.find(o => o.name === "十年之约")?.url || "https://www.foreverblog.cn/");

// 装饰性品牌文字（站点域名大写形式）
const brandDomain = new URL(siteConfig.siteUrl).host.toUpperCase();

// 注入页面加载状态
const pageLoading = inject<Ref<boolean>>("pageLoading", ref(false));

const profileTags: ProfileTag[] = [
  { icon: "💻", label: "AI全栈工程师" },
  { icon: "📸", label: "摄影爱好者" },
  { icon: "🎵", label: "音乐迷" },
  { icon: "✍️", label: "博主" },
];

const activeProfileTagIndex = ref(0);
const activeProfileTag = computed<ProfileTag>(() => profileTags[activeProfileTagIndex.value] ?? profileTags[0]!);
const profileTagCarouselDelay = 2400;
let profileTagCarouselTimer: ReturnType<typeof setInterval> | null = null;

const stopProfileTagCarousel = () => {
  if (!profileTagCarouselTimer) {
    return;
  }

  clearInterval(profileTagCarouselTimer);
  profileTagCarouselTimer = null;
};

const showNextProfileTag = () => {
  activeProfileTagIndex.value = (activeProfileTagIndex.value + 1) % profileTags.length;
};

const startProfileTagCarousel = () => {
  if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) {
    return;
  }

  stopProfileTagCarousel();
  profileTagCarouselTimer = setInterval(showNextProfileTag, profileTagCarouselDelay);
};

const skillGroups: SkillGroup[] = [
  {
    key: "agent",
    title: "Agent 开发",
    short: "AGT",
    tabTitle: "Agent 开发",
    role: "智能体工程",
    eyebrow: "agent engineering",
    summary: "用 LangChain 与 LangGraph 把任务拆解、工具调用、RAG 检索与记忆反馈编排成工作流，配合 MCP 构建可观测的智能体应用。",
    stacks: [
      { label: "LangChain", icon: "/skills/langchain.svg" },
      { label: "LangGraph", icon: "/skills/langgraph.svg" },
      { label: "MCP", icon: "/skills/mcp.svg" },
      { label: "RAG 知识检索", icon: "/skills/knowledge.svg" },
      { label: "Tool Calling", icon: "/skills/tool.svg" },
      { label: "Agentic Memory", icon: "/skills/memory.svg" },
    ],
  },
  {
    key: "python",
    title: "Python 开发",
    short: "PY",
    tabTitle: "Python 开发",
    role: "服务与脚本",
    eyebrow: "backend toolkit",
    summary: "以 Python 为核心把服务、脚本与数据处理管线快速落成，用 FastAPI / Django / Flask 对外提供接口，把 AI 能力接进真实业务。",
    stacks: [
      { label: "FastAPI", icon: "/skills/fastapi.svg" },
      { label: "Pydantic", icon: "/skills/pydantic.svg" },
      { label: "Flask", icon: "/skills/flask.svg" },
      { label: "Django", icon: "/skills/django.svg" },
      { label: "SQLAlchemy", icon: "/skills/sqlalchemy.svg" },
      { label: "MySQL", icon: "/skills/mysql.svg" },
    ],
  },
  {
    key: "frontend",
    title: "前端开发",
    short: "WEB",
    tabTitle: "前端开发",
    role: "体验工程",
    eyebrow: "interface craft",
    summary: "围绕 Vue 生态把信息结构、交互反馈与视觉节奏组织成稳定、顺手、可维护的界面，配合 TypeScript 与 Tailwind 让类型与样式始终可控。",
    stacks: [
      { label: "Nuxt", icon: "/skills/nuxt.svg" },
      { label: "Vue", icon: "/skills/vuejs.svg" },
      { label: "Vue Router", icon: "/skills/router.svg" },
      { label: "Pinia", icon: "/skills/pinia.svg" },
      { label: "TypeScript", icon: "/skills/typescript.svg" },
      { label: "Tailwind CSS", icon: "/skills/tailwindcss.svg" },
    ],
  },
  {
    key: "other",
    title: "其他技能",
    short: "OTH",
    tabTitle: "其他技能",
    role: "工程基建",
    eyebrow: "infra & tooling",
    summary: "工程化与日常工具箱：微信小程序、CI/CD 与 Docker 容器化部署，配合 Git 版本管理与 Linux 运维，以及 Nginx 等周边基础设施。",
    stacks: [
      { label: "微信小程序", icon: "/skills/wechat.svg" },
      { label: "CI/CD", icon: "/skills/cicd.svg" },
      { label: "Docker", icon: "/skills/docker.svg" },
      { label: "Git", icon: "/skills/git.svg" },
      { label: "Linux", icon: "/skills/linux.svg" },
      { label: "Nginx", icon: "/skills/nginx.svg" },
    ],
  },
];

const activeSkillIndex = ref(0);
const skillSlideDirection = ref<"next" | "prev">("next");
const skillSlideTransitionName = computed(() => `skill-slide-${skillSlideDirection.value}`);
const activeSkillGroup = computed<SkillGroup>(() => skillGroups[activeSkillIndex.value] ?? skillGroups[0]!);
const skillCarouselDelay = 5000;
let skillCarouselTimer: ReturnType<typeof setInterval> | null = null;

const stopSkillCarousel = () => {
  if (!skillCarouselTimer) {
    return;
  }

  clearInterval(skillCarouselTimer);
  skillCarouselTimer = null;
};

const setSkillGroup = (index: number) => {
  if (index === activeSkillIndex.value) {
    return;
  }

  skillSlideDirection.value = index > activeSkillIndex.value ? "next" : "prev";
  activeSkillIndex.value = index;
};

const showNextSkillGroup = () => {
  skillSlideDirection.value = "next";
  activeSkillIndex.value = (activeSkillIndex.value + 1) % skillGroups.length;
};

const showPrevSkillGroup = () => {
  skillSlideDirection.value = "prev";
  activeSkillIndex.value = (activeSkillIndex.value - 1 + skillGroups.length) % skillGroups.length;
};

const selectSkillGroup = (index: number) => {
  setSkillGroup(index);
};

const startSkillCarousel = () => {
  if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) {
    return;
  }

  stopSkillCarousel();
  skillCarouselTimer = setInterval(showNextSkillGroup, skillCarouselDelay);
};

// SPA 导航时挂起一个 fadeDuration，让旧页渐出完成后再挂载，避免 fixed 网格 / brandDomain
// 装饰文字（无 opacity:0 初始态）在 mainOpacity 过渡期间提前露脸闪烁。详见 useFadeOutOnNavigate。
await useFadeOutOnNavigate();

// 获取统计数据
const { data: statsData } = await useFetch("/api/stats", {
  headers: getInternalRequestHeaders(),
});
const stats = computed(() => ({
  publishedContentsNum: statsData.value?.data?.publishedContentsNum || 0,
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
  publishedContentsNum: 0,
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

// MBTI特质配置：主导特质、对立特质与维度专属色（对齐 16personalities 五维配色）
const mbtiTraits = [
  { key: "extroversion", color: "#4298B4", label: "外向", opposite: "内向" },
  { key: "intuition", color: "#E4AE3A", label: "天马行空", opposite: "求真务实" },
  { key: "thinking", color: "#33A474", label: "情感细腻", opposite: "理性思考" },
  { key: "prospecting", color: "#88619A", label: "运筹帷幄", opposite: "随机应变" },
  { key: "assertive", color: "#F25E62", label: "自信果断", opposite: "情绪易波动" },
] as const;

// MBTI动画数据
const animatedMbtiData = ref({
  extroversion: 0,
  intuition: 0,
  thinking: 0,
  prospecting: 0,
  assertive: 0,
});

// 十年之约履约进度（加入十年之约的日期：2024-07-21）
// 用本地时间构造，与下方 pledgeEndDate / pledgeFormattedDate 的本地 getFullYear/Month/Date 口径一致；
// 若用 new Date("2024-07-21") 会按 UTC 解析，负时区下格式化会偏移一天
const pledgeStartDate = new Date(2024, 6, 21);
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
    // 卸载后不再写 ref，也不再继续调度
    if (disposed) return;
    const elapsed = timestamp - start;
    const progress = Math.min(elapsed / duration, 1);
    // 使用缓动函数
    const easeProgress = 1 - Math.pow(1 - progress, 3);
    current = Math.floor(from + range * easeProgress);
    callback(current);

    if (progress < 1) {
      numberAnimationRafs.push(requestAnimationFrame(updateNumber));
    }
  };

  numberAnimationRafs.push(requestAnimationFrame(updateNumber));
};

// 滚动动画
let scrollObserver: IntersectionObserver | null = null;
// 数字动画的 RAF 句柄 —— 卸载时全部取消，否则 RAF 会在 teardown 后继续写 ref 直到缓动结束
const numberAnimationRafs: number[] = [];
// initAnimations 递归 setTimeout 的待执行 id —— 卸载时取消，避免 teardown 后仍新建 IntersectionObserver
let initAnimationsTimer: ReturnType<typeof setTimeout> | undefined;
// 卸载标志 —— 阻止递归与动画回调在组件销毁后继续操作 DOM/ref
let disposed = false;

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
          animateNumber(0, stats.value.publishedContentsNum, 2000, value => {
            animatedStats.value.publishedContentsNum = value;
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
    if (disposed) return;
    if (pageLoading.value) {
      // 页面还在加载中，等待100ms后再检查
      initAnimationsTimer = setTimeout(initAnimations, 100);
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
                animateNumber(0, stats.value.publishedContentsNum, 2000, value => {
                  animatedStats.value.publishedContentsNum = value;
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
  startProfileTagCarousel();
  startSkillCarousel();
});

onUnmounted(() => {
  disposed = true;
  if (initAnimationsTimer) {
    clearTimeout(initAnimationsTimer);
  }
  for (const id of numberAnimationRafs) {
    cancelAnimationFrame(id);
  }
  numberAnimationRafs.length = 0;
  scrollObserver?.disconnect();
  stopProfileTagCarousel();
  stopSkillCarousel();
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

/* 技能轮播动画 */
.skill-slide-next-enter-active,
.skill-slide-next-leave-active,
.skill-slide-prev-enter-active,
.skill-slide-prev-leave-active {
  transition:
    opacity 0.24s ease,
    transform 0.24s ease;
}

.skill-slide-next-enter-from,
.skill-slide-prev-leave-to {
  opacity: 0;
  transform: translateX(18px);
}

.skill-slide-next-leave-to,
.skill-slide-prev-enter-from {
  opacity: 0;
  transform: translateX(-18px);
}

.skill-orbit {
  animation: skillOrbit 14s linear infinite;
}

.skill-orbit::before {
  background: rgb(37 99 235 / 0.5);
  border-radius: 9999px;
  content: "";
  height: 0.55rem;
  left: 50%;
  position: absolute;
  top: -0.275rem;
  transform: translateX(-50%);
  width: 0.55rem;
}

@keyframes skillOrbit {
  from {
    transform: rotate(0deg);
  }
  to {
    transform: rotate(360deg);
  }
}

@media (prefers-reduced-motion: reduce) {
  .skill-slide-next-enter-active,
  .skill-slide-next-leave-active,
  .skill-slide-prev-enter-active,
  .skill-slide-prev-leave-active,
  .skill-orbit {
    animation: none;
    transition: none;
  }

  /* 滚动渐入（.ready opacity:0 + .fadeIn slideUp）也对减弱动态效果降级：内容直接可见、不做位移渐入 */
  .ready {
    opacity: 1;
  }
  .fadeIn {
    animation: none;
    transition: none;
  }
}

/* 身份标签轮播 */
.profile-tag-enter-active,
.profile-tag-leave-active {
  transition:
    opacity 0.22s ease,
    transform 0.22s ease;
}

.profile-tag-enter-from {
  opacity: 0;
  transform: translateY(0.75rem);
}

.profile-tag-leave-to {
  opacity: 0;
  transform: translateY(-0.75rem);
}

/* 兴趣卡片翻转 */
.interest-card:hover .interest-card-inner,
.interest-card:focus-within .interest-card-inner {
  transform: rotateY(180deg);
}


.about-pass-through :deep(a),
.about-pass-through :deep(button),
.about-pass-through :deep(img),
.about-pass-through :deep(input),
.about-pass-through :deep(textarea),
.about-pass-through :deep(select),
.about-pass-through :deep(label),
.about-pass-through :deep(.interest-card) {
  pointer-events: auto;
}
</style>
