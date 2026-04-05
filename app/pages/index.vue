<template>
  <div class="index-box min-h-screen relative w-full">
    <!-- 英雄区 - fixed定位，独立于section -->
    <h1 id="index-hero-title" class="sr-only">欢迎来到 ImQi1</h1>
    <div
      ref="heroRef"
      class="index-hero fixed inset-0 flex flex-col items-center justify-center max-w-250 w-[90vw] mx-auto left-0 right-0"
      :style="heroStyle">
      <div class="index-hero-box flex items-center justify-between w-full opacity-0 animate-fade-in">
        <!-- 标题区域 -->
        <div class="index-hero-title p-1.5">
          <h1 class="index-first-line text-slate-900 text-[6em] font-black leading-none">IM<span class="text-red-600">QI1</span>.COM</h1>
          <div class="index-second-line mt-4 text-slate-600 text-lg">
            {{ homeAnnounce }}
          </div>
        </div>

        <!-- 头像区域 -->
        <div class="index-avatar-box h-fit max-md:hidden">
          <img src="/imgs/avatar.webp" alt="头像" class="index-avatar rounded-full max-w-50 w-50 h-50 object-cover" />
        </div>

        <!-- 滚动提示 -->
        <div class="index-scroll absolute -bottom-20 left-1/2 -translate-x-1/2 text-gray-600 animate-bounce max-md:-bottom-20">
          <RiMouseLine class="size-4" />
        </div>
      </div>

      <!-- 联系链接 -->
      <div class="index-contact flex mt-3 self-start animate-fade-in max-md:mx-auto">
        <a
          v-for="link in contactLinks"
          :key="link.name"
          :href="link.url"
          :target="link.target ? '_blank' : undefined"
          class="index-contact-link group relative flex items-center justify-center w-9 h-9 rounded-md transition-all duration-200 text-gray-500 hover:bg-slate-100 hover:text-slate-900">
          <component :is="link.icon" class="size-5" />
          <!-- 小程序二维码 -->
          <template v-if="link.name === 'miniprogram'">
            <img
              src="/imgs/miniprogram.jpg"
              alt="小程序码"
              style="width: 192px; height: 192px; max-width: none; max-height: none;"
              class="absolute bottom-full left-1/2 -translate-x-1/2 rounded-xl border border-slate-100 opacity-0 invisible group-hover:opacity-100 group-hover:visible transition-all duration-200 pointer-events-none group-hover:pointer-events-auto" />
          </template>
        </a>
      </div>
    </div>

    <!-- 占位section，用于撑开页面高度 -->
    <section class="h-[calc(100vh-250px)] mb-62.5" aria-hidden="true"></section>

    <!-- 为什么要做这个网站 -->
    <section class="index-about-this mx-auto max-w-275 animate-fade-in" aria-labelledby="index-why-title">
      <h2 id="index-why-title" class="index-why-this text-slate-500 text-sm">？ 为什么要做这个网站</h2>
      <div class="index-why-reason tracking-[0.1ch] leading-[1.7em] mt-2.5 max-w-187.5">
        <p class="my-2.5">
          起初建站只是一时兴起，和大多数人一样，我只是想记录下自己学习编程的心路历程和笔记，供自己以后有个参考。刚开始我以为有一个自己的网站是一个小众爱好，直到后来我才发现网络上有很多对此感兴趣的伙伴，于是我开始和他们保持联系。随着时间的增长，我对软件开发有了更浓厚的兴趣，我开始和同学、朋友交流，也有了自己独立开发的想法。在这之前我曾换过多个框架、主题，最终还是觉得自己开发一个主题最有成就感，也最能证明自己真正地学到了东西，所以你能在这里看到这些文字，也能看到我在此记录的其他内容。
        </p>
        <p class="my-2.5">我喜欢游山玩水，有自己的爱好，活动。我觉得一切有趣的事情，都会在此记录。</p>
      </div>
    </section>

    <!-- 间隔 -->
    <div class="h-37.5"></div>

    <!-- 网站架构 -->
    <section class="index-website-framework animate-fade-in" aria-labelledby="index-framework-title">
      <div class="index-website-framework-content max-w-fit w-full mx-auto">
        <div class="index-framework-title mb-10">
          <h2 id="index-framework-title" class="index-theme-title1 text-blue-700 text-sm font-bold">网站架构</h2>
          <div class="index-theme-title2 text-slate-800 text-[1.6em] font-bold my-1">加载时间长的网页是劝退用户的主要因素</div>
          <div class="index-theme-title3 text-slate-500 text-sm inline">
            <p>Typecho 足够轻量，可最大地发挥服务器性能</p>
          </div>
          <div class="index-theme-title3 text-slate-500 text-sm inline">
            <p>腾讯云 EdgeOne 遍布全球的边缘节点，以最快速度响应和回源必要资源</p>
          </div>
        </div>
        <div class="index-website-framework-box flex items-center justify-center gap-8 flex-wrap max-md:flex-col-reverse">
          <div class="index-framework-item flex flex-col relative">
            <img class="index-framework-pic rounded-full w-25 h-25" src="/imgs/chrome.png" alt="浏览器">
            <span class="absolute -bottom-6 left-0 right-0 text-center text-sm text-slate-500">浏览器</span>
          </div>
          <div class="index-framework-arrow max-md:-rotate-90 max-md:mt-7">
            <RiArrowLeftLine class="text-2xl text-slate-400" />
          </div>
          <div class="index-framework-item flex flex-col relative">
            <img class="index-framework-pic rounded-full w-25 h-25" src="/imgs/edgeone.png" alt="Edgeone">
            <span class="absolute -bottom-6 left-0 right-0 text-center text-sm text-slate-500">EdgeOne</span>
          </div>
          <div class="index-framework-arrow max-md:-rotate-90 max-md:mt-7">
            <RiArrowLeftLine class="text-2xl text-slate-400" />
          </div>
          <div class="index-framework-item flex flex-col relative">
            <img class="index-framework-pic rounded-full w-25 h-25" src="/imgs/jdcloud.png" alt="云服务器">
            <span class="absolute -bottom-6 left-0 right-0 text-center text-sm text-slate-500">云服务器</span>
          </div>
          <div class="index-framework-arrow max-md:-rotate-90 max-md:mt-7">
            <RiArrowLeftLine class="text-2xl text-slate-400" />
          </div>
          <div class="index-framework-item flex flex-col relative">
            <img class="index-framework-pic rounded-full w-25 h-25" src="/imgs/typecho.png" alt="Typecho">
            <span class="absolute -bottom-6 left-0 right-0 text-center text-sm text-slate-500">Typecho</span>
          </div>
        </div>
        <div class="index-framework-introduction mt-20 font-medium max-w-200 mx-auto text-center text-slate-600 leading-relaxed">
          本站主题名为 NewImQi1，是我制作的第一款主题，从 2024 年 10 月开始制作，到现在仍持续更新中。最新版的 NewImQi1 主题重构了 Pjax 的整个周期，采用全新的带自动销毁的事件管理器，确保切换页面时没有内存泄漏，你可以在<a href="/updates" class="text-blue-600 hover:underline">更新日志</a>查看所有的主题更新信息。NewImQi1 在 Typecho 1.3  的原有功能上做了很多扩充，包括但不限于友情链接、RSS 订阅系统、小程序、图片灯箱、评论归属地显示、实况照片，正文还可以嵌入多种多样的组件。为增强安全，本站设置了评论 Token 校验、CSP，资源部署在 EdgeOne 上，配合 Service Worker，在保证功能丰富的同时，也不会牺牲太多性能。
        </div>
      </div>
    </section>

    <!-- 大间隔 -->
    <div class="h-62.5"></div>

    <!-- 样式选择 -->
    <div class="index-theme -mt-5 mx-auto max-w-200">
      <div class="index-theme-inner">
        <div class="index-theme-themes mb-50 max-md:text-center">
          <h2 class="index-theme-title1 text-blue-700 text-sm">样式选择</h2>
          <div class="index-theme-title2 text-slate-800 text-[1.6em] font-bold my-1">保持界面清爽，同时不牺牲功能丰富度</div>
          <div class="index-theme-title3 text-slate-500 text-sm">选择字体类型，合理规划布局，注意颜色搭配，添加边框圆角。</div>
        </div>
        <div class="index-theme-introduction flex max-md:justify-center">
          <!-- 左侧选项 -->
          <div class="index-theme-left flex flex-col gap-12.5">
            <div
              v-for="(item, index) in themeItems"
              :key="index"
              :ref="setThemeItemRef"
              class="index-theme-item flex flex-col items-start justify-center h-75 max-w-75">
              <div class="index-theme-title3 text-slate-500 text-sm">{{ item.title }}</div>
              <div v-if="item.type === 'grid'" class="index-theme-content grid grid-cols-2 gap-x-4 gap-y-1.5 mt-2.5 max-w-75">
                <template v-for="(grid, gIndex) in item.grids" :key="gIndex">
                  <div v-if="grid.isLink" class="index-theme-grid">
                    <a :href="grid.href" class="text-slate-900 hover:underline" target="_blank">{{ grid.text }}</a>
                  </div>
                  <div v-else-if="grid.isCode" class="index-theme-grid">
                    <code class="bg-slate-100 px-1 rounded text-sm">{{ grid.text }}</code>
                  </div>
                  <div v-else-if="grid.hasIcon" class="index-theme-grid flex items-center gap-1">
                    {{ grid.text }}
                    <RiRemixiconFill class="text-slate-600" />
                  </div>
                  <div v-else-if="grid.isCategory" class="index-theme-grid text-slate-800">
                    {{ grid.text }}
                  </div>
                  <a v-else-if="grid.href" :href="grid.href" class="index-theme-grid text-slate-900 hover:underline" target="_blank">
                    {{ grid.text }}
                  </a>
                  <div v-else class="index-theme-grid">{{ grid.text }}</div>
                </template>
              </div>
              <div v-else class="index-theme-content2 tracking-[0.1ch] mt-5">
                {{ item.content }}
              </div>
            </div>
          </div>

          <!-- 右侧展示 -->
          <div class="index-theme-right flex-1 flex justify-end relative max-md:hidden">
            <div class="index-theme-right-items flex items-center justify-center h-75 sticky w-full top-[calc(50%-150px)]">
              <div
                v-for="(rightItem, index) in themeRightItems"
                :key="index"
                class="index-theme-right-item h-75 opacity-0 pointer-events-none absolute transition-opacity duration-500"
                :class="{ 'opacity-100 pointer-events-auto': activeThemeIndex === index }">
                <!-- 字体展示 -->
                <div v-if="rightItem.type === 'fonts'" class="index-theme-box relative h-75 w-75">
                  <div class="index-theme-serif grid grid-cols-2 grid-rows-2 place-items-center justify-items-center text-[2.5em] font-bold border border-slate-200 rounded-xl shadow-sm h-38 w-38 absolute left-28 top-19 animate-float">
                    <span>之</span>
                    <span>的</span>
                    <span>事</span>
                    <span>以</span>
                  </div>
                  <code class="index-theme-mono bg-slate-50 border border-slate-200 rounded shadow-sm px-2 py-1 absolute left-2.5 bottom-14 animate-float-delay-1">
                    <span class="text-blue-700">print</span>(<span class="text-green-700">"Hello World"</span>)
                  </code>
                  <div class="index-theme-icon grid grid-cols-2 grid-rows-2 place-items-center justify-items-center text-xl bg-slate-50 border border-slate-200 rounded shadow-sm h-19 w-19 absolute left-14 top-8 animate-float-delay-2">
                    <span><RiAttachmentLine class="text-slate-600" /></span>
                    <span><RiFileZipFill class="text-slate-600" /></span>
                    <span><RiVideoFill class="text-slate-600" /></span>
                    <span><RiRestartLine class="text-slate-600" /></span>
                  </div>
                </div>

                <!-- 布局图片 -->
                <div v-else-if="rightItem.type === 'layout'" class="index-theme-box relative h-75 w-75">
                  <div
                    class="index-theme-img absolute top-6 left-6 w-50 h-50 rounded-xl shadow-sm bg-cover bg-center border border-slate-200 overflow-hidden">
                    <img src="/imgs/shenyang.webp" class="absolute inset-0 aspect-square object-cover" alt="沈阳站">
                  </div>
                  <div class="index-theme-border absolute top-31 left-36 w-38 h-38 bg-slate-100 rounded-xl border border-slate-200 transition-transform"></div>
                </div>

                <!-- 音乐播放器 -->
                <div v-else-if="rightItem.type === 'music'" class="index-theme-box relative h-75 w-75 flex items-center justify-center">
                  <div class="index-theme-music-box absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-full">
                    <div class="text-slate-500 text-sm text-center">音乐播放器占位</div>
                    <div class="text-slate-400 text-xs text-center mt-2">支持嵌入网易云音乐、QQ音乐等</div>
                  </div>
                </div>

                <!-- 文章预览 -->
                <div v-else-if="rightItem.type === 'article'" class="index-theme-box relative h-75 w-75 flex items-center justify-center">
                  <div class="index-theme-article-box flex flex-col items-start h-fit w-full">
                    <div class="text-slate-500 text-sm">随机文章占位</div>
                    <div class="text-slate-400 text-xs mt-2">这里会显示一篇随机文章的预览</div>
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

    <!-- 阅读更多 -->
    <section class="index-read-more mx-auto max-w-275 animate-fade-in" aria-labelledby="index-read-more-title">
      <h2 id="index-read-more-title" class="index-theme-title2 text-slate-800 text-[1.6em] font-bold text-center">阅读更多</h2>
      <div class="index-read-more-inner flex flex-wrap justify-center gap-4 mt-8">
        <a href="/subscription" class="px-6 py-2.5 bg-slate-100 hover:bg-slate-200 rounded-lg text-slate-700 transition-colors">我的订阅</a>
        <a href="/agreement" class="px-6 py-2.5 bg-slate-100 hover:bg-slate-200 rounded-lg text-slate-700 transition-colors">协议</a>
        <a href="/sitemap" class="px-6 py-2.5 bg-slate-100 hover:bg-slate-200 rounded-lg text-slate-700 transition-colors">站点地图</a>
        <a href="/archiving" class="px-6 py-2.5 bg-slate-100 hover:bg-slate-200 rounded-lg text-slate-700 transition-colors">归档</a>
        <a href="/updates" class="px-6 py-2.5 bg-slate-100 hover:bg-slate-200 rounded-lg text-slate-700 transition-colors">更新日志</a>
        <a href="/feed" target="_blank" class="px-6 py-2.5 bg-slate-100 hover:bg-slate-200 rounded-lg text-slate-700 transition-colors">订阅本站</a>
      </div>
    </section>

    <!-- 底部间隔 -->
    <div class="h-37.5"></div>
  </div>
</template>

<script setup>
import {
  RiAttachmentLine,
  RiArrowLeftLine,
  RiFileZipFill,
  RiGithubFill,
  RiHome2Fill,
  RiLinksFill,
  RiMailFill,
  RiMiniProgramFill,
  RiMouseLine,
  RiNpmjsFill,
  RiRemixiconFill,
  RiRestartLine,
  RiTwitterXFill,
  RiVideoFill,
} from "@remixicon/vue";
import { markRaw, nextTick, onMounted, onUnmounted, ref } from "vue";

// 首页公告（占位符，后续可以从API获取）
const homeAnnounce = ref("做技术的分享者 · 生活的摄影师 · 时事的评论员");

// 联系链接配置
const contactLinks = ref([
  { name: "email", url: "mailto:imqi1@qq.com", icon: markRaw(RiMailFill), target: true },
  { name: "github", url: "https://github.com/imqi1-github", icon: markRaw(RiGithubFill), target: true },
  { name: "npm", url: "https://www.npmjs.com/~imqi1-npm", icon: markRaw(RiNpmjsFill), target: true },
  { name: "x", url: "https://x.com/imqi1_X", icon: markRaw(RiTwitterXFill), target: true },
  { name: "home", url: "https://qi1.website", icon: markRaw(RiHome2Fill), target: true },
  { name: "link", url: "/link", icon: markRaw(RiLinksFill), target: false },
  { name: "miniprogram", url: "", icon: markRaw(RiMiniProgramFill), target: false },
]);

// 样式选择区域数据
const themeItems = [
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
    grids: [
      { text: "音乐播放器" },
      { text: "视频播放器" },
      { text: "代码块" },
      { text: "TIP 组件" },
      { text: "轮播图" },
      { text: "..." },
    ],
  },
  {
    title: "用文章的方式记录生活",
    type: "grid",
    grids: [
      { text: "小记", href: "/note" },
      { text: "记录旅游、活动、生活中的小事。", isCategory: true },
      { text: "图片", href: "/shot" },
      { text: "美好的瞬间都值得被记录。", isCategory: true },
      { text: "技术", href: "/tech" },
      { text: "分享开发中有趣的事情。", isCategory: true },
      { text: "讨论", href: "/discuss" },
      { text: "理性地发表自己的看法。", isCategory: true },
    ],
  },
];

const themeRightItems = [
  { type: "fonts" },
  { type: "layout", image: "/imgs/shenyang.webp" },
  { type: "music" },
  { type: "article" },
];

// 当前激活的样式索引
const activeThemeIndex = ref(0);

// 样式选项元素的ref数组 - 使用Set去重
const themeItemRefsSet = new Set();
const themeItemRefs = ref([]);

const setThemeItemRef = (el) => {
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

    heroStyle.value = {
      transform: `scale(${Math.max(scale, 0)})`,
      opacity: Math.max(opacity, 0).toString(),
      display: scrollTop > 550 ? "none" : "",
    };
  }
};

// 初始化滚动动画
onMounted(() => {
  // 监听滚动 - 英雄区缩放/淡出
  window.addEventListener("scroll", handleScroll);

  // 监听滚动 - 样式选择区域跟随效果
  window.addEventListener("scroll", () => {
    requestAnimationFrame(checkVisibleItems);
  });

  // 等待DOM渲染后初始化
  nextTick(() => {
    checkVisibleItems();
  });

  // 滚动渐入效果监听
  const observerOptions = {
    threshold: 0.1,
    rootMargin: "0px 0px -50px 0px",
  };

  const fadeInObserver = new IntersectionObserver((entries) => {
    entries.forEach((entry) => {
      if (entry.isIntersecting) {
        entry.target.classList.add("fade-in-start");
        fadeInObserver.unobserve(entry.target);
      }
    });
  }, observerOptions);

  // 观察所有需要滚动渐入的元素
  document.querySelectorAll(".animate-fade-in:not(.fade-in-start)").forEach((el) => {
    fadeInObserver.observe(el);
  });
});

onUnmounted(() => {
  window.removeEventListener("scroll", handleScroll);
});
</script>

<style scoped>
/* 滚动淡入动画 */
.animate-fade-in {
  opacity: 0;
  transform: translateY(30px);
  transition: opacity 0.6s cubic-bezier(0.4, 0, 0.2, 1), transform 0.6s cubic-bezier(0.4, 0, 0.2, 1);
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
  0%, 100% {
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
