<template>
  <div class="about-bold m-auto max-w-7xl min-h-screen overflow-x-hidden relative w-full">
    <div
      class="about-bold-bg-text bottom-0 text-slate-100 text-[clamp(4rem,12vw,16rem)] font-extrabold left-3/100 tracking-tighter pointer-events-none leading-[.8] fixed [text-orientation:mixed] select-none [writing-mode:sideways-lr] z-0">
      <h1 id="about-page-title" class="sr-only">关于我</h1>
      IMQI1.COM
    </div>

    <div class="about-bold-main p-16 md:p-24 max-sm:p-4 relative z-10">
      <!-- 头部区域 -->
      <div class="about-bold-header grid grid-cols-1 md:grid-cols-2 gap-16 items-end mb-32">
        <div class="about-bold-header-left pl-8">
          <div class="about-bold-avatar w-48 h-48 rounded-full border-6 border-slate-100 shadow-lg overflow-hidden mb-8">
            <img src="@/assets/imgs/avatar.webp" alt="Qi1" class="w-full h-full object-cover" />
          </div>
          <h1 class="about-bold-name text-slate-900 text-[clamp(3rem,8vw,6rem)] font-black tracking-tight leading-[.9] mb-4">Qi1</h1>
          <p class="about-bold-tagline text-slate-600 text-lg leading-relaxed max-w-xs">做技术的分享者 · 生活的摄影师 · 时事的评论员</p>
        </div>
        <div class="about-bold-header-right pb-8 text-right">
          <div class="about-bold-big-label text-blue-600 text-xs tracking-widest mb-4 uppercase">ABOUT ME</div>
          <div class="about-bold-description text-slate-800 text-2xl font-medium leading-relaxed mb-8">
            我热爱编程，喜欢记录生活，分享有趣的事情。这是我的个人博客，记录着技术、生活和思考。
          </div>
          <div class="about-bold-badges flex flex-wrap gap-3 justify-end">
            <span class="about-bold-badge bg-slate-100 border border-slate-200 rounded-full text-slate-600 text-sm px-4 py-2">💻 全栈开发者</span>
            <span class="about-bold-badge bg-slate-100 border border-slate-200 rounded-full text-slate-600 text-sm px-4 py-2">📸 摄影爱好者</span>
            <span class="about-bold-badge bg-slate-100 border border-slate-200 rounded-full text-slate-600 text-sm px-4 py-2">🎵 音乐迷</span>
            <span class="about-bold-badge bg-slate-100 border border-slate-200 rounded-full text-slate-600 text-sm px-4 py-2">✍️ 博主</span>
          </div>
        </div>
      </div>

      <!-- 游山玩水 -->
      <div class="about-bold-section about-bold-section-left ml-5% mb-24">
        <div class="about-bold-number text-blue-600 text-xs font-bold mb-2">01</div>
        <h2 class="about-bold-section-title text-slate-900 text-[clamp(2rem,5vw,3.5rem)] font-extrabold tracking-tight leading-none mb-8">
          游山玩水
        </h2>
        <div class="about-bold-locations grid grid-cols-1 md:grid-cols-3 gap-6">
          <div class="about-bold-location-item aspect-video rounded-2xl overflow-hidden relative">
            <img
              class="about-bold-location-img w-full h-full object-cover transition-transform duration-500"
              src="@/assets/imgs/jixi.webp"
              alt="沈阳" />
            <div class="about-bold-location-overlay absolute bottom-0 left-0 right-0 bg-linear-to-t from-black/70 to-transparent text-white p-6">
              <div class="about-bold-location-label text-xs mb-1 opacity-80">来自</div>
              <div class="about-bold-location-name text-lg font-semibold">黑龙江省鸡西市</div>
            </div>
          </div>
          <div class="about-bold-location-item aspect-video rounded-2xl overflow-hidden relative">
            <img
              class="about-bold-location-img w-full h-full object-cover transition-transform duration-500"
              src="@/assets/imgs/ysu.webp"
              alt="燕山大学" />
            <div class="about-bold-location-overlay absolute bottom-0 left-0 right-0 bg-linear-to-t from-black/70 to-transparent text-white p-6">
              <div class="about-bold-location-label text-xs mb-1 opacity-80">毕业于</div>
              <div class="about-bold-location-name text-lg font-semibold">燕山大学</div>
            </div>
          </div>
          <div class="about-bold-location-item aspect-video rounded-2xl overflow-hidden relative">
            <img
              class="about-bold-location-img w-full h-full object-cover transition-transform duration-500"
              src="@/assets/imgs/shenyang.webp"
              alt="秦皇岛" />
            <div class="about-bold-location-overlay absolute bottom-0 left-0 right-0 bg-linear-to-t from-black/70 to-transparent text-white p-6">
              <div class="about-bold-location-label text-xs mb-1 opacity-80">现居</div>
              <div class="about-bold-location-name text-lg font-semibold">辽宁省沈阳市</div>
            </div>
          </div>
        </div>
      </div>

      <!-- 技多不压身 -->
      <div class="about-bold-section about-bold-section-right ml-50% mb-24">
        <div class="about-bold-number text-blue-600 text-xs font-bold mb-2">02</div>
        <h2 class="about-bold-section-title text-slate-900 text-[clamp(2rem,5vw,3.5rem)] font-extrabold tracking-tight leading-none mb-8">
          技多不压身
        </h2>
        <div class="about-bold-skills overflow-hidden py-16 relative">
          <div class="about-bold-skills-wrapper ml-[-10%] transform -rotate-12 transform-origin-center w-[120%]">
            <div class="about-bold-skills-track flex gap-4 animate-scroll-diagonal w-max">
              <img
                class="about-bold-skill-img bg-slate-100 rounded-lg shrink-0 w-16 h-16 object-contain p-3 transition-transform duration-200 hover:-translate-y-2"
                src="@/assets/skills/regex.svg"
                alt="Regex"
                title="正则表达式" />
              <img
                class="about-bold-skill-img bg-slate-100 rounded-lg shrink-0 w-16 h-16 object-contain p-3 transition-transform duration-200 hover:-translate-y-2"
                src="@/assets/skills/c.svg"
                alt="C"
                title="C" />
              <img
                class="about-bold-skill-img bg-slate-100 rounded-lg shrink-0 w-16 h-16 object-contain p-3 transition-transform duration-200 hover:-translate-y-2"
                src="@/assets/skills/cpp.svg"
                alt="C++"
                title="C++" />
              <img
                class="about-bold-skill-img bg-slate-100 rounded-lg shrink-0 w-16 h-16 object-contain p-3 transition-transform duration-200 hover:-translate-y-2"
                src="@/assets/skills/java.svg"
                alt="Java"
                title="Java" />
              <img
                class="about-bold-skill-img bg-slate-100 rounded-lg shrink-0 w-16 h-16 object-contain p-3 transition-transform duration-200 hover:-translate-y-2"
                src="@/assets/skills/sqlite.svg"
                alt="SQLite"
                title="SQLite" />
              <img
                class="about-bold-skill-img bg-slate-100 rounded-lg shrink-0 w-16 h-16 object-contain p-3 transition-transform duration-200 hover:-translate-y-2"
                src="@/assets/skills/mysql.svg"
                alt="MySQL"
                title="MySQL" />
              <img
                class="about-bold-skill-img bg-slate-100 rounded-lg shrink-0 w-16 h-16 object-contain p-3 transition-transform duration-200 hover:-translate-y-2"
                src="@/assets/skills/html.svg"
                alt="HTML"
                title="HTML" />
              <img
                class="about-bold-skill-img bg-slate-100 rounded-lg shrink-0 w-16 h-16 object-contain p-3 transition-transform duration-200 hover:-translate-y-2"
                src="@/assets/skills/css.svg"
                alt="CSS"
                title="CSS" />
              <img
                class="about-bold-skill-img bg-slate-100 rounded-lg shrink-0 w-16 h-16 object-contain p-3 transition-transform duration-200 hover:-translate-y-2"
                src="@/assets/skills/js.svg"
                alt="JavaScript"
                title="JavaScript" />
              <img
                class="about-bold-skill-img bg-slate-100 rounded-lg shrink-0 w-16 h-16 object-contain p-3 transition-transform duration-200 hover:-translate-y-2"
                src="@/assets/skills/php.svg"
                alt="PHP"
                title="PHP" />
              <img
                class="about-bold-skill-img bg-slate-100 rounded-lg shrink-0 w-16 h-16 object-contain p-3 transition-transform duration-200 hover:-translate-y-2"
                src="@/assets/skills/md.svg"
                alt="Markdown"
                title="Markdown" />
              <img
                class="about-bold-skill-img bg-slate-100 rounded-lg shrink-0 w-16 h-16 object-contain p-3 transition-transform duration-200 hover:-translate-y-2"
                src="@/assets/skills/latex.svg"
                alt="LaTeX"
                title="LaTeX" />
              <img
                class="about-bold-skill-img bg-slate-100 rounded-lg shrink-0 w-16 h-16 object-contain p-3 transition-transform duration-200 hover:-translate-y-2"
                src="@/assets/skills/python.svg"
                alt="Python"
                title="Python" />
              <img
                class="about-bold-skill-img bg-slate-100 rounded-lg shrink-0 w-16 h-16 object-contain p-3 transition-transform duration-200 hover:-translate-y-2"
                src="@/assets/skills/qt.svg"
                alt="Qt"
                title="Qt" />
              <img
                class="about-bold-skill-img bg-slate-100 rounded-lg shrink-0 w-16 h-16 object-contain p-3 transition-transform duration-200 hover:-translate-y-2"
                src="@/assets/skills/regex.svg"
                alt="Regex"
                title="正则表达式" />
              <img
                class="about-bold-skill-img bg-slate-100 rounded-lg shrink-0 w-16 h-16 object-contain p-3 transition-transform duration-200 hover:-translate-y-2"
                src="@/assets/skills/c.svg"
                alt="C"
                title="C" />
              <img
                class="about-bold-skill-img bg-slate-100 rounded-lg shrink-0 w-16 h-16 object-contain p-3 transition-transform duration-200 hover:-translate-y-2"
                src="@/assets/skills/cpp.svg"
                alt="C++"
                title="C++" />
              <img
                class="about-bold-skill-img bg-slate-100 rounded-lg shrink-0 w-16 h-16 object-contain p-3 transition-transform duration-200 hover:-translate-y-2"
                src="@/assets/skills/java.svg"
                alt="Java"
                title="Java" />
              <img
                class="about-bold-skill-img bg-slate-100 rounded-lg shrink-0 w-16 h-16 object-contain p-3 transition-transform duration-200 hover:-translate-y-2"
                src="@/assets/skills/sqlite.svg"
                alt="SQLite"
                title="SQLite" />
              <img
                class="about-bold-skill-img bg-slate-100 rounded-lg shrink-0 w-16 h-16 object-contain p-3 transition-transform duration-200 hover:-translate-y-2"
                src="@/assets/skills/mysql.svg"
                alt="MySQL"
                title="MySQL" />
              <img
                class="about-bold-skill-img bg-slate-100 rounded-lg shrink-0 w-16 h-16 object-contain p-3 transition-transform duration-200 hover:-translate-y-2"
                src="@/assets/skills/html.svg"
                alt="HTML"
                title="HTML" />
              <img
                class="about-bold-skill-img bg-slate-100 rounded-lg shrink-0 w-16 h-16 object-contain p-3 transition-transform duration-200 hover:-translate-y-2"
                src="@/assets/skills/css.svg"
                alt="CSS"
                title="CSS" />
              <img
                class="about-bold-skill-img bg-slate-100 rounded-lg shrink-0 w-16 h-16 object-contain p-3 transition-transform duration-200 hover:-translate-y-2"
                src="@/assets/skills/js.svg"
                alt="JavaScript"
                title="JavaScript" />
              <img
                class="about-bold-skill-img bg-slate-100 rounded-lg shrink-0 w-16 h-16 object-contain p-3 transition-transform duration-200 hover:-translate-y-2"
                src="@/assets/skills/php.svg"
                alt="PHP"
                title="PHP" />
              <img
                class="about-bold-skill-img bg-slate-100 rounded-lg shrink-0 w-16 h-16 object-contain p-3 transition-transform duration-200 hover:-translate-y-2"
                src="@/assets/skills/md.svg"
                alt="Markdown"
                title="Markdown" />
              <img
                class="about-bold-skill-img bg-slate-100 rounded-lg shrink-0 w-16 h-16 object-contain p-3 transition-transform duration-200 hover:-translate-y-2"
                src="@/assets/skills/latex.svg"
                alt="LaTeX"
                title="LaTeX" />
              <img
                class="about-bold-skill-img bg-slate-100 rounded-lg shrink-0 w-16 h-16 object-contain p-3 transition-transform duration-200 hover:-translate-y-2"
                src="@/assets/skills/python.svg"
                alt="Python"
                title="Python" />
              <img
                class="about-bold-skill-img bg-slate-100 rounded-lg shrink-0 w-16 h-16 object-contain p-3 transition-transform duration-200 hover:-translate-y-2"
                src="@/assets/skills/qt.svg"
                alt="Qt"
                title="Qt" />
            </div>
          </div>
        </div>
      </div>

      <!-- 兴趣广泛 -->
      <div class="about-bold-section about-bold-section-left ml-[5%] mb-24">
        <div class="about-bold-number text-blue-600 text-xs font-bold mb-2">03</div>
        <h2 class="about-bold-section-title text-slate-900 text-[clamp(2rem,5vw,3.5rem)] font-extrabold tracking-tight leading-none mb-8">
          兴趣广泛
        </h2>
        <div class="about-bold-hobbies flex gap-4 pt-3">
          <div class="about-bold-hobby bg-slate-100 rounded-lg p-6 text-center transition-transform duration-200 w-20 hover:-translate-y-2">
            <span class="about-bold-hobby-emoji block text-2xl mb-2">💻</span>
            <span class="about-bold-hobby-name text-slate-800 font-medium [text-orientation:mixed] [writing-mode:vertical-rl]">编程</span>
          </div>
          <div class="about-bold-hobby bg-slate-100 rounded-lg p-6 text-center transition-transform duration-200 w-20 hover:-translate-y-2">
            <span class="about-bold-hobby-emoji block text-2xl mb-2">🎮</span>
            <span class="about-bold-hobby-name text-slate-800 font-medium [text-orientation:mixed] [writing-mode:vertical-rl]">游戏</span>
          </div>
          <div class="about-bold-hobby bg-slate-100 rounded-lg p-6 text-center transition-transform duration-200 w-20 hover:-translate-y-2">
            <span class="about-bold-hobby-emoji block text-2xl mb-2">🎸</span>
            <span class="about-bold-hobby-name text-slate-800 font-medium [text-orientation:mixed] [writing-mode:vertical-rl]">音乐</span>
          </div>
          <div class="about-bold-hobby bg-slate-100 rounded-lg p-6 text-center transition-transform duration-200 w-20 hover:-translate-y-2">
            <span class="about-bold-hobby-emoji block text-2xl mb-2">📸</span>
            <span class="about-bold-hobby-name text-slate-800 font-medium [text-orientation:mixed] [writing-mode:vertical-rl]">摄影</span>
          </div>
          <div class="about-bold-hobby bg-slate-100 rounded-lg p-6 text-center transition-transform duration-200 w-20 hover:-translate-y-2">
            <span class="about-bold-hobby-emoji block text-2xl mb-2">📚</span>
            <span class="about-bold-hobby-name text-slate-800 font-medium [text-orientation:mixed] [writing-mode:vertical-rl]">阅读</span>
          </div>
          <div class="about-bold-hobby bg-slate-100 rounded-lg p-6 text-center transition-transform duration-200 w-20 hover:-translate-y-2">
            <span class="about-bold-hobby-emoji block text-2xl mb-2">✈️</span>
            <span class="about-bold-hobby-name text-slate-800 font-medium [text-orientation:mixed] [writing-mode:vertical-rl]">旅行</span>
          </div>
        </div>
      </div>

      <!-- 16 Personality -->
      <div class="about-bold-section about-bold-section-right ml-50% mb-24">
        <div class="about-bold-number text-blue-600 text-xs font-bold mb-2">04</div>
        <h2 class="about-bold-section-title text-slate-900 text-[clamp(2rem,5vw,3.5rem)] font-extrabold tracking-tight leading-none mb-8">
          16 Personality
        </h2>
        <div class="about-bold-mbti bg-slate-100 rounded-2xl p-8">
          <div class="about-bold-mbti-header flex items-center gap-8 mb-8">
            <div class="about-bold-mbti-type shrink-0">
              <img src="@/assets/imgs/entp.svg" alt="ENTP" class="w-32 h-32 object-contain" />
            </div>
            <div class="about-bold-mbti-info flex-1">
              <div class="about-bold-mbti-name text-slate-900 text-xl font-bold mb-2">辩论家 · ENTP-A</div>
              <div class="about-bold-mbti-desc text-slate-600 mb-4">外向 · 直觉 · 思维 · 展望</div>
              <div class="about-bold-mbti-traits flex flex-wrap gap-2">
                <span class="about-bold-mbti-trait bg-slate-200 rounded-lg text-slate-600 text-sm px-3 py-1">富有创意</span>
                <span class="about-bold-mbti-trait bg-slate-200 rounded-lg text-slate-600 text-sm px-3 py-1">思维敏捷</span>
                <span class="about-bold-mbti-trait bg-slate-200 rounded-lg text-slate-600 text-sm px-3 py-1">善于辩论</span>
                <span class="about-bold-mbti-trait bg-slate-200 rounded-lg text-slate-600 text-sm px-3 py-1">追求知识</span>
              </div>
            </div>
          </div>
          <div class="about-bold-mbti-bars grid gap-4">
            <div class="about-bold-mbti-bar flex items-center gap-4">
              <div class="about-bold-mbti-bar-label text-slate-600 text-sm w-16">外向</div>
              <div class="about-bold-mbti-bar-track bg-slate-200 rounded-full flex-1 h-2 overflow-hidden">
                <div class="about-bold-mbti-bar-fill bg-blue-600 rounded-full h-full transition-all duration-1000" style="width: 78%"></div>
              </div>
              <div class="about-bold-mbti-bar-value text-slate-800 text-sm font-semibold text-right w-12">78%</div>
            </div>
            <div class="about-bold-mbti-bar flex items-center gap-4">
              <div class="about-bold-mbti-bar-label text-slate-600 text-sm w-16">直觉</div>
              <div class="about-bold-mbti-bar-track bg-slate-200 rounded-full flex-1 h-2 overflow-hidden">
                <div class="about-bold-mbti-bar-fill bg-blue-600 rounded-full h-full transition-all duration-1000" style="width: 64%"></div>
              </div>
              <div class="about-bold-mbti-bar-value text-slate-800 text-sm font-semibold text-right w-12">64%</div>
            </div>
            <div class="about-bold-mbti-bar flex items-center gap-4">
              <div class="about-bold-mbti-bar-label text-slate-600 text-sm w-16">思维</div>
              <div class="about-bold-mbti-bar-track bg-slate-200 rounded-full flex-1 h-2 overflow-hidden">
                <div class="about-bold-mbti-bar-fill bg-blue-600 rounded-full h-full transition-all duration-1000" style="width: 71%"></div>
              </div>
              <div class="about-bold-mbti-bar-value text-slate-800 text-sm font-semibold text-right w-12">71%</div>
            </div>
            <div class="about-bold-mbti-bar flex items-center gap-4">
              <div class="about-bold-mbti-bar-label text-slate-600 text-sm w-16">展望</div>
              <div class="about-bold-mbti-bar-track bg-slate-200 rounded-full flex-1 h-2 overflow-hidden">
                <div class="about-bold-mbti-bar-fill bg-blue-600 rounded-full h-full transition-all duration-1000" style="width: 76%"></div>
              </div>
              <div class="about-bold-mbti-bar-value text-slate-800 text-sm font-semibold text-right w-12">76%</div>
            </div>
            <div class="about-bold-mbti-bar flex items-center gap-4">
              <div class="about-bold-mbti-bar-label text-slate-600 text-sm w-16">坚决</div>
              <div class="about-bold-mbti-bar-track bg-slate-200 rounded-full flex-1 h-2 overflow-hidden">
                <div class="about-bold-mbti-bar-fill bg-blue-600 rounded-full h-full transition-all duration-1000" style="width: 69%"></div>
              </div>
              <div class="about-bold-mbti-bar-value text-slate-800 text-sm font-semibold text-right w-12">69%</div>
            </div>
          </div>
          <a
            href="https://www.16personalities.com/ch/entp-%E4%BA%BA%E6%A0%BC"
            target="_blank"
            class="about-bold-mbti-link flex items-center bg-blue-600 rounded-full text-white font-semibold gap-2 mt-6 px-6 py-3 transition-all duration-200 w-fit hover:bg-blue-500">
            了解更多 <RiArrowRightLine class="size-4" />
          </a>
        </div>
      </div>

      <!-- 站点统计 -->
      <div class="about-bold-section about-bold-section-left ml-5% mb-24">
        <div class="about-bold-number text-blue-600 text-xs font-bold mb-2">05</div>
        <h2 class="about-bold-section-title text-slate-900 text-[clamp(2rem,5vw,3.5rem)] font-extrabold tracking-tight leading-none mb-8">
          站点统计
        </h2>
        <div class="about-bold-stats grid grid-cols-1 md:grid-cols-4 gap-4">
          <div class="about-bold-stat text-center">
            <div class="about-bold-stat-number text-blue-600 text-3xl font-black leading-none mb-2">2022</div>
            <div class="about-bold-stat-label text-slate-600 text-xs tracking-widest uppercase">建站年份</div>
          </div>
          <div class="about-bold-stat text-center">
            <div class="about-bold-stat-number text-blue-600 text-3xl font-black leading-none mb-2">{{ stats.publishedPostsNum }}</div>
            <div class="about-bold-stat-label text-slate-600 text-xs tracking-widest uppercase">篇文章</div>
          </div>
          <div class="about-bold-stat text-center">
            <div class="about-bold-stat-number text-blue-600 text-3xl font-black leading-none mb-2">{{ stats.publishedCommentsNum }}</div>
            <div class="about-bold-stat-label text-slate-600 text-xs tracking-widest uppercase">评论</div>
          </div>
          <div class="about-bold-stat text-center">
            <div class="about-bold-stat-number text-blue-600 text-3xl font-black leading-none mb-2">30</div>
            <div class="about-bold-stat-label text-slate-600 text-xs tracking-widest uppercase">技术栈</div>
          </div>
        </div>
      </div>

      <!-- 交个朋友 -->
      <div class="about-bold-section about-bold-section-right ml-50% mb-24">
        <div class="about-bold-number text-blue-600 text-xs font-bold mb-2">06</div>
        <h2 class="about-bold-section-title text-slate-900 text-[clamp(2rem,5vw,3.5rem)] font-extrabold tracking-tight leading-none mb-8">
          交个朋友
        </h2>
        <p class="text-slate-600 text-lg mb-6">欢迎与我交流技术和生活</p>
        <div class="about-bold-contact flex flex-wrap gap-4">
          <a
            href="mailto:imqi1@qq.com"
            class="about-bold-contact-link flex items-center bg-blue-600 border border-slate-200 rounded-full text-white font-semibold gap-3 px-8 py-4 transition-all duration-200 hover:bg-blue-500 hover:shadow">
            <RiMailLine class="size-4 fill-white" />
            发邮件
          </a>
          <a
            href="https://qi1.website"
            target="_blank"
            class="about-bold-contact-link flex items-center bg-slate-100 border border-slate-200 rounded-full text-slate-800 font-semibold gap-3 px-8 py-4 transition-all duration-200 hover:bg-blue-600 hover:*:fill-white hover:shadow hover:text-white">
            <RiHomeLine class="transition-all duration-200 size-4 fill-slate-600" />
            主页
          </a>
          <a
            href="https://github.com/imqi1-github"
            target="_blank"
            class="about-bold-contact-link flex items-center bg-slate-100 border border-slate-200 rounded-full text-slate-800 font-semibold gap-3 px-8 py-4 transition-all duration-200 hover:bg-blue-600 hover:*:fill-white hover:shadow hover:text-white">
            <RiGithubLine class="transition-all duration-200 size-4 fill-slate-600" />
            GitHub
          </a>
        </div>
      </div>

      <!-- 引言 -->
      <div class="about-bold-quote my-24 py-16 relative">
        <div class="about-bold-quote-text text-slate-900 text-2xl font-bold leading-relaxed max-w-2xl pl-12 relative">
          <div class="absolute -top-36 left-0 text-[12em] text-slate-200 size-fit -z-1 opacity-55">"</div>
          山海寻梦，不觉其远<br />前路迢迢，阔步而行
        </div>
        <div class="about-bold-quote-author text-slate-600 mt-6 pl-12 relative">—— 习近平 · 二〇二六年新年贺词</div>
      </div>

      <!-- 导航 -->
      <div class="about-bold-section mb-24">
        <div class="about-bold-nav grid grid-cols-1 md:grid-cols-3 gap-6">
          <a
            href="/archiving"
            class="about-bold-nav-item group bg-slate-100 border border-slate-200 rounded-2xl p-10 transition-all duration-300 hover:bg-white hover:border-blue-500 hover:shadow-xl hover:shadow-blue-500/10 hover:-translate-y-1">
            <div
              class="about-bold-nav-icon flex items-center justify-center bg-slate-200 rounded-lg text-blue-600 text-2xl w-16 h-16 mb-4 transition-all duration-300 group-hover:bg-blue-600 group-hover:text-white group-hover:scale-110">
              <RiArchiveLine class="size-8" />
            </div>
            <div class="about-bold-nav-title text-slate-800 text-xl font-bold mb-1 transition-colors duration-300 group-hover:text-blue-600">
              文章归档
            </div>
            <div class="about-bold-nav-desc text-slate-600 text-sm">浏览所有文章</div>
          </a>
          <a
            href="/sitemap"
            class="about-bold-nav-item group bg-slate-100 border border-slate-200 rounded-2xl p-10 transition-all duration-300 hover:bg-white hover:border-blue-500 hover:shadow-xl hover:shadow-blue-500/10 hover:-translate-y-1">
            <div
              class="about-bold-nav-icon flex items-center justify-center bg-slate-200 rounded-lg text-blue-600 text-2xl w-16 h-16 mb-4 transition-all duration-300 group-hover:bg-blue-600 group-hover:text-white group-hover:scale-110">
              <RiCompassLine class="size-8" />
            </div>
            <div class="about-bold-nav-title text-slate-800 text-xl font-bold mb-1 transition-colors duration-300 group-hover:text-blue-600">
              站点地图
            </div>
            <div class="about-bold-nav-desc text-slate-600 text-sm">探索本站结构</div>
          </a>
          <a
            href="/link"
            class="about-bold-nav-item group bg-slate-100 border border-slate-200 rounded-2xl p-10 transition-all duration-300 hover:bg-white hover:border-blue-500 hover:shadow-xl hover:shadow-blue-500/10 hover:-translate-y-1">
            <div
              class="about-bold-nav-icon flex items-center justify-center bg-slate-200 rounded-lg text-blue-600 text-2xl w-16 h-16 mb-4 transition-all duration-300 group-hover:bg-blue-600 group-hover:text-white group-hover:scale-110">
              <RiEditLine class="size-8" />
            </div>
            <div class="about-bold-nav-title text-slate-800 text-xl font-bold mb-1 transition-colors duration-300 group-hover:text-blue-600">
              更新日志
            </div>
            <div class="about-bold-nav-desc text-slate-600 text-sm">不断优化主题</div>
          </a>
        </div>
      </div>

      <!-- 更多故事 -->
      <div class="about-bold-content-section border-t-2 border-slate-200 mt-32 pt-12">
        <h2 class="about-bold-content-title text-slate-900 text-[clamp(2.5rem,6vw,4rem)] font-black tracking-tight leading-none mb-12">更多故事</h2>
        <div class="about-bold-content text-slate-800 text-lg leading-relaxed max-w-2xl space-y-8">
          <!-- 第一节：关于本站 -->
          <div class="about-story-section">
            <h3 class="text-2xl font-bold text-slate-900 mb-4">关于本站</h3>
            <p class="mb-4">这个网站是我庞大信息世界中的一个藏身之所，我喜欢在这里记录我觉得有趣的东西。</p>
            <p class="mb-4">包括但不限于生活中有趣的事情、好看的景色、游戏，有时还比较关心时事。</p>
            <p>本人热爱代码，所以偶尔也会写点技术文章。</p>
          </div>
          <!-- 第二节：框架？主题？ -->
          <div class="about-story-section">
            <h3 class="text-2xl font-bold text-slate-900 mb-4">框架？主题？</h3>
            <p class="mb-4">你所看到的这一版网站是我制作的第二款主题，第一款框架，整体采用 Nuxt 4 编写，我给这个 CMS 取名为 Glass。</p>
            <p class="mb-4"></p>
            <p class="mb-4">这款主题从 2026 年 4 月 1 日开始制作，保留了之前 Typecho 版本的绝大多数功能，可以让我在更改技术栈的同时，继续使用之前的功能。</p>
            <p>本主题不开源。</p>
          </div>
        </div>
      </div>
    </div>

    <div class="about-huge-blank my-24 mx-4 w-px"></div>
  </div>
</template>

<script setup>
import { RiArchiveLine, RiArrowRightLine, RiCompassLine, RiEditLine, RiGithubLine, RiHomeLine, RiMailLine } from "@remixicon/vue";
import { onMounted, ref } from "vue";

// 模拟统计数据
const stats = ref({
  publishedPostsNum: 100,
  publishedCommentsNum: 500,
});

// 模拟内容
const content = ref("");

// 滚动动画
onMounted(() => {
  const observer = new IntersectionObserver(
    entries => {
      entries.forEach(entry => {
        if (entry.isIntersecting) {
          entry.target.classList.add("fadeIn");
        }
      });
    },
    {
      threshold: 0.1,
    },
  );

  document.querySelectorAll(".ready").forEach(el => {
    observer.observe(el);
  });
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

/* 位置调整 */
.ml-5\% {
  margin-left: 5%;
}

.ml-50\% {
  margin-left: 50%;
}

/* 响应式调整 */
@media (max-width: 768px) {
  .about-bold-section-right {
    margin-left: 0 !important;
  }

  .about-bold-section-left {
    margin-left: 0 !important;
  }

  .about-bold-header {
    grid-template-columns: 1fr;
    gap: 8rem;
  }

  .about-bold-header-right {
    text-align: left;
  }

  .about-bold-badges {
    justify-content: flex-start;
  }

  .about-bold-locations {
    grid-template-columns: 1fr;
  }

  .about-bold-stats {
    grid-template-columns: repeat(2, 1fr);
  }

  .about-bold-nav {
    grid-template-columns: 1fr;
  }
}
</style>
