
import MarkdownIt from "markdown-it";
import type Renderer from "markdown-it/lib/renderer.mjs";
import type Token from "markdown-it/lib/token.mjs";
import Shiki from "@shikijs/markdown-it";
import type { ThemeRegistration } from "shiki";
import { transformerNotationHighlight, transformerNotationDiff } from "@shikijs/transformers";
import container from "markdown-it-container";
// 只加载常见语言，减少服务端内存占用
import javascript from "@shikijs/langs/javascript";
import typescript from "@shikijs/langs/typescript";
import python from "@shikijs/langs/python";
import java from "@shikijs/langs/java";
import cpp from "@shikijs/langs/cpp";
import c from "@shikijs/langs/c";
import css from "@shikijs/langs/css";
import html from "@shikijs/langs/html";
import json from "@shikijs/langs/json";
import bash from "@shikijs/langs/bash";
import sql from "@shikijs/langs/sql";
import php from "@shikijs/langs/php";
import yaml from "@shikijs/langs/yaml";
import toml from "@shikijs/langs/toml";
import markdown from "@shikijs/langs/markdown";
import vue from "@shikijs/langs/vue";
import tsx from "@shikijs/langs/tsx";
import jsx from "@shikijs/langs/jsx";
import ini from "@shikijs/langs/ini";
import powershell from "@shikijs/langs/powershell";

import { escapeAttribute, escapeHtml, sanitizeHtml } from "#shared/html";
import islandLightTheme from "@/shiki/island_light";
import islandDarkTheme from "@/shiki/island_dark";
import type { RenderRule, MusicPlatform } from "#server/types/utils/markdown";

// 自定义主题需要断言为 Shiki 接受的格式
const lightTheme = islandLightTheme as ThemeRegistration;
const darkTheme = islandDarkTheme as ThemeRegistration;

const supportedLanguages = new Set([
    "javascript",
    "js",
    "typescript",
    "ts",
    "python",
  "py",
  "java",
  "cpp",
  "c++",
  "c",
  "css",
  "html",
  "json",
  "bash",
  "sh",
  "shell",
  "sql",
  "php",
  "yaml",
  "yml",
  "toml",
  "markdown",
  "md",
  "vue",
  "tsx",
  "jsx",
  "ini",
  "powershell",
  "ps1",
]);

// 行内链接小卡片：已知域名的 markdown 行内链接渲染成带品牌图标的徽章样式。
// 首版收录 GitHub / Gitee / 百度 / 谷歌 / 腾讯 / 微信；同 slug 可配多 host（如腾讯、微信各有两个主域名）。
const LINK_CHIP_DOMAINS: Array<{ slug: string; host: string }> = [
  { slug: "github", host: "github.com" },
  { slug: "gitee", host: "gitee.com" },
  { slug: "baidu", host: "baidu.com" },
  { slug: "google", host: "google.com" },
  // 更具体的子域名必须排在父域名之前：weixin.qq.com / wx.qq.com 若排在 qq.com 后面，
  // 会被 `.qq.com` 后缀匹配先吞掉，导致微信链接拿到腾讯图标。
  { slug: "wechat", host: "weixin.qq.com" },
  { slug: "wechat", host: "wx.qq.com" },
  { slug: "tencent", host: "qq.com" },
  { slug: "tencent", host: "tencent.com" },
  // mozilla.org 后缀匹配自动覆盖 developer.mozilla.org(MDN) / www.mozilla.org；
  // npmjs.com 覆盖 docs.npmjs.com / www.npmjs.com，npmjs.org 兼容旧 registry 链接。
  { slug: "mozilla", host: "mozilla.org" },
  { slug: "npm", host: "npmjs.com" },
  { slug: "npm", host: "npmjs.org" },
];

// 根据链接 href 判断是否命中已知域名卡片，命中返回其 slug（如 "github"），否则返回 null。
// 仅接受 http/https 外链，主机名精确匹配或以 ".域名" 结尾匹配（gist.github.com → github、mp.weixin.qq.com → wechat）。
function getLinkChipDomain(href: string): { slug: string } | null {
  let url: URL;
  try {
    url = new URL(href);
  } catch {
    return null;
  }
  if (url.protocol !== "http:" && url.protocol !== "https:") {
    return null;
  }
  const host = url.hostname.toLowerCase();
  for (const domain of LINK_CHIP_DOMAINS) {
    if (host === domain.host || host.endsWith(`.${domain.host}`)) {
      return { slug: domain.slug };
    }
  }
  return null;
}

const simpleMd = new MarkdownIt({
  html: false,
  linkify: false,
  typographer: false,
  breaks: true,
});

// 单例模式的 markdown 实例
let mdInstance: MarkdownIt | null = null;

// 初始化 MarkdownIt with Shiki
async function createMarkdownInstance(): Promise<MarkdownIt> {
  if (mdInstance) {
    return mdInstance;
  }

  const md = MarkdownIt({
    html: true,
    linkify: true,
    typographer: true,
    breaks: true,
  });

  // 自定义链接渲染规则（新窗口打开）
  md.renderer.rules.link_open = (
    tokens: Token[],
    idx: number,
    options: Parameters<RenderRule>[2],
    env: Parameters<RenderRule>[3],
    self: Renderer,
  ) => {
    const token = tokens[idx];

    if (!token) {
      return "";
    }

    const aIndex = token.attrIndex("target");
    if (aIndex < 0) {
      token.attrPush(["target", "_blank"]);
    } else {
      // attrIndex >= 0 已保证 attrs 非空且该下标存在；noUncheckedIndexedAccess 下仍需断言
      token.attrs![aIndex]![1] = "_blank";
    }
    const relIndex = token.attrIndex("rel");
    if (relIndex < 0) {
      token.attrPush(["rel", "noopener noreferrer"]);
    }
    // 已知域名的行内链接在文本前插入一个空 <span class="markdown-link-icon markdown-link-icon--<slug>">。
    // 链接本身不额外加 class、保持普通超链接外观（含 hover 下划线）；图标由 CSS mask 绘制
    // （iconify 类在本仓库不生效，见正文页 .markdown-link-icon），只呈现不变样式。
    const href = token.attrGet("href");
    const chipDomain = href ? getLinkChipDomain(href) : null;
    const rendered = self.renderToken(tokens, idx, options);
    return chipDomain ? `${rendered}<span class="markdown-link-icon markdown-link-icon--${chipDomain.slug}" aria-hidden="true"></span>` : rendered;
  };

  // 自定义图片渲染规则（包装成 figure 并添加标题）
  md.renderer.rules.image = (tokens: Token[], idx: number, options: Parameters<RenderRule>[2], env: Parameters<RenderRule>[3], self: Renderer) => {
    const token = tokens[idx];

    if (!token) {
      return "";
    }

    const src = token.attrGet("src") || "";
    const alt = token.content || "";
    const isLiveImage = src.includes("#live") || alt.includes("[live]");

    if (isLiveImage) {
      const caption = alt.replace(/\[live\]/gi, "").trim();
      const params = caption ? `${src} | ${caption}` : src;
      return `<div class="markdown-live-photo-wrapper" data-params="${escapeAttribute(encodeURIComponent(params))}"></div>`;
    }

    token.attrSet("loading", "lazy");
    token.attrSet("class", "markdown-image");
    token.attrSet("data-lightbox", "gallery");
    if (alt) {
      token.attrSet("data-caption", alt);
    }

    // 先渲染图片标签
    const imgHtml = self.renderToken(tokens, idx, options);

    // 如果有 alt 文本，包装成 figure 并添加 figcaption
    if (alt) {
      return `<figure class="markdown-figure">${imgHtml}<figcaption class="markdown-figcaption">${escapeHtml(alt)}</figcaption></figure>`;
    }

    return imgHtml;
  };

  // 配置 Shiki（只加载常见语言）
  md.use(
    await Shiki({
      themes: {
        light: lightTheme,
        dark: darkTheme,
      },
      langs: [
        javascript,
        typescript,
        python,
        java,
        cpp,
        c,
        css,
        html,
        json,
        bash,
        sql,
        php,
        yaml,
        toml,
        markdown,
        vue,
        tsx,
        jsx,
        ini,
        powershell,
      ],
      // 未找到语言时的 fallback
      fallbackLanguage: "json",
      transformers: [transformerNotationHighlight(), transformerNotationDiff()],
    }),
  );

  // 自定义代码块渲染规则 - 处理 "语言+文件名" 格式 + 未知语言 fallback
  const defaultFence =
    md.renderer.rules.fence ||
    function (tokens: Token[], idx: number, options: Parameters<RenderRule>[2], env: Parameters<RenderRule>[3], self: Renderer) {
      return self.renderToken(tokens, idx, options);
    };

  function normalizeClassName(s: string): string {
    return s
      .trim()
      .replace(/\s+/g, "-")
      .replace(/[<>"'&`]/g, "-");
  }

  function parseFenceInfo(info: string) {
    const trimmedInfo = info.trim();
    const separatorIndex = trimmedInfo.indexOf("+");
    if (separatorIndex <= 0) {
      return { shikiLang: trimmedInfo, className: normalizeClassName(trimmedInfo) };
    }

    if (supportedLanguages.has(trimmedInfo.toLowerCase())) {
      return { shikiLang: trimmedInfo, className: normalizeClassName(trimmedInfo) };
    }

    const baseLang = trimmedInfo.slice(0, separatorIndex);
    const possibleFileName = trimmedInfo.slice(separatorIndex + 1);
    if (!possibleFileName || !/[./\\]/.test(possibleFileName)) {
      return { shikiLang: baseLang, className: normalizeClassName(baseLang) };
    }

    return {
      shikiLang: baseLang,
      className: normalizeClassName(trimmedInfo),
    };
  }

  md.renderer.rules.fence = (tokens: Token[], idx: number, options: Parameters<RenderRule>[2], env: Parameters<RenderRule>[3], self: Renderer) => {
    const token = tokens[idx];

    if (!token) {
      return "";
    }

    const info = token.info || "";
    const codeLines = token.content.split("\n");
    if (codeLines[codeLines.length - 1] === "") {
      codeLines.pop();
    }
    const shouldCollapse = codeLines.length > 14;
    const { shikiLang, className } = parseFenceInfo(info);
    const renderPlainCode = () => {
      const code = codeLines.map((line: string) => `<span class="line">${escapeHtml(line)}</span>`).join("\n");
      const collapseClass = shouldCollapse ? " code-collapsed" : "";
      const langClass = className ? ` language-${className}` : "";
      const codeClass = className ? ` class="language-${className}"` : "";
      return `<pre class="shiki${langClass}${collapseClass}" tabindex="0"><code${codeClass}>${code}</code></pre>`;
    };
    const applyCollapseClass = (html: string) => {
      if (!shouldCollapse || html.includes("code-collapsed")) return html;
      return html.replace(/<pre class="([^"]*)"/, '<pre class="$1 code-collapsed"');
    };

    if (!shikiLang || !supportedLanguages.has(shikiLang.toLowerCase())) {
      return renderPlainCode();
    }

    const shikiClassName = normalizeClassName(shikiLang);
    const restoreClassName = (html: string) =>
      html.replace(
        /class="([^"]*)\blanguage-(?:json|text|plaintext)(\s|$)([^"]*)"/,
        (_match: string, before: string, after: string, rest: string) => `class="${before}language-${className}${after}${rest}"`,
      );

    token.info = shikiLang;

    let result: string;
    try {
      result = defaultFence(tokens, idx, options, env, self);
      if (className && className !== shikiClassName) {
        result = result.replace(`language-${shikiClassName}`, `language-${className}`);
      } else if (className && !result.includes(`language-${className}`)) {
        result = restoreClassName(result);
      }
    } catch (error) {
      console.error(error);
      token.info = "json";
      try {
        result = applyCollapseClass(restoreClassName(defaultFence(tokens, idx, options, env, self)));
      } catch (error2) {
        console.error(error2);
        result = renderPlainCode();
      }
    } finally {
      token.info = info;
    }

    return applyCollapseClass(result);
  };

  // 配置容器插件（用于折叠等功能）
  md.use(container, "details", {
    validate: (params: string) => {
      // 只匹配以 "details" 开头的内容
      return params.trim().match(/^details\s+(.*)$/);
    },
    render: (tokens: Token[], idx: number) => {
      const token = tokens[idx];

      if (!token) {
        return "";
      }

      const info = token.info.trim();
      // 提取标题（去掉 "details" 前缀）
      const summary = info.replace(/^details\s+/, "").trim() || "展开";

      if (token.nesting === 1) {
        // 开始容器
        return `<div class="markdown-details-wrapper" data-summary="${escapeAttribute(summary)}">`;
      } else {
        // 结束容器
        return `</div>`;
      }
    },
  });

  // 视频容器
  md.use(container, "video", {
    validate: (params: string) => {
      // 匹配 "video URL" 格式
      return params.trim().match(/^video\s+(.+)$/);
    },
    render: (tokens: Token[], idx: number) => {
      const token = tokens[idx];

      if (!token) {
        return "";
      }

      const info = token.info.trim();
      // 提取视频 URL（去掉 "video" 前缀）
      const url = info.replace(/^video\s+/, "").trim();

      if (token.nesting === 1) {
        // 开始容器
        return `<div class="markdown-video-wrapper" data-url="${escapeAttribute(url)}">`;
      } else {
        // 结束容器
        return `</div>`;
      }
    },
  });

  // 提示框容器（支持 success, warning, error, info 四种类型）
  md.use(container, "callout", {
    validate: (params: string) => {
      // 匹配 "callout type" 格式
      return params.trim().match(/^callout\s+(success|warning|error|info)$/);
    },
    render: (tokens: Token[], idx: number) => {
      const token = tokens[idx];

      if (!token) {
        return "";
      }

      const info = token.info.trim();
      // 提取类型（去掉 "callout" 前缀）
      const type = info.replace(/^callout\s+/, "").trim();

      if (token.nesting === 1) {
        // 开始容器
        return `<div class="markdown-callout-wrapper" data-type="${escapeAttribute(type)}">`;
      } else {
        // 结束容器
        return `</div>`;
      }
    },
  });

  // 卡片容器（用于展示超链接卡片）
  md.use(container, "card", {
    validate: (params: string) => {
      // 匹配 "card url | title | description | image" 格式
      return params.trim().match(/^card\s+(.+)$/);
    },
    render: (tokens: Token[], idx: number) => {
      const token = tokens[idx];

      if (!token) {
        return "";
      }

      const info = token.info.trim();
      // 提取参数（去掉 "card" 前缀）
      const paramsStr = info.replace(/^card\s+/, "").trim();

      if (token.nesting === 1) {
        // 开始容器，将参数存储在 data 属性中
        return `<div class="markdown-card-wrapper" data-params="${escapeAttribute(encodeURIComponent(paramsStr))}">`;
      } else {
        // 结束容器
        return `</div>`;
      }
    },
  });

  // 实况照片容器（紧凑语法：:::live-photo URL 标题）
  md.use(container, "live-photo", {
    validate: (params: string) => {
      return params.trim().match(/^live-photo\s+(.+)$/);
    },
    render: (tokens: Token[], idx: number) => {
      const token = tokens[idx];

      if (!token) {
        return "";
      }

      const info = token.info.trim();
      const paramsStr = info.replace(/^live-photo\s+/, "").trim();

      if (token.nesting === 1) {
        return `<div class="markdown-live-photo-wrapper" data-params="${escapeAttribute(encodeURIComponent(paramsStr))}">`;
      } else {
        return `</div>`;
      }
    },
  });

  // 轮播图容器（多图片轮播，每张图片带标题）
  md.use(container, "swiper", {
    validate: (params: string) => {
      // 匹配 "swiper" 格式（不需要额外参数）
      return params.trim().match(/^swiper$/);
    },
    render: (tokens: Token[], idx: number) => {
      const token = tokens[idx];

      if (!token) {
        return "";
      }

      if (token.nesting === 1) {
        // 开始容器
        return `<div class="markdown-swiper-wrapper">`;
      } else {
        // 结束容器
        return `</div>`;
      }
    },
  });

  // 仓库卡片容器（支持 GitHub 和 Gitee）
  md.use(container, "repo", {
    validate: (params: string) => {
      // 匹配 "repo URL" 格式
      return params.trim().match(/^repo\s+(https:\/\/(?:github|gitee)\.com\/[^/\s]+\/[^/\s]+)$/);
    },
    render: (tokens: Token[], idx: number) => {
      const token = tokens[idx];

      if (!token) {
        return "";
      }

      const info = token.info.trim();
      // 提取仓库 URL（去掉 "repo" 前缀）
      const url = info.replace(/^repo\s+/, "").trim();

      if (token.nesting === 1) {
        // 开始容器
        return `<div class="markdown-repo-wrapper" data-url="${escapeAttribute(url)}">`;
      } else {
        // 结束容器
        return `</div>`;
      }
    },
  });

  // 音乐播放器容器（支持 MetingJS）
  md.use(container, "music", {
    validate: (params: string) => {
      // 匹配多种格式：
      // 1. :::music auto https://example.com:::
      // 2. :::music song netease 123456:::
      // 3. :::music playlist netease 123456:::
      return params.trim().match(/^music\s+(.+)$/);
    },
    render: (tokens: Token[], idx: number) => {
      const token = tokens[idx];

      if (!token) {
        return "";
      }

      const info = token.info.trim();
      // 提取参数（去掉 "music" 前缀）
      const paramsStr = info.replace(/^music\s+/, "").trim();

      if (token.nesting === 1) {
        // 开始容器，将参数存储在 data 属性中
        return `<div class="markdown-music-wrapper" data-params="${escapeAttribute(encodeURIComponent(paramsStr))}">`;
      } else {
        // 结束容器
        return `</div>`;
      }
    },
  });

  // 简单外链卡片容器（只包含标题和链接）
  md.use(container, "simple-card", {
    validate: (params: string) => {
      // 匹配 "simple-card url | title" 格式
      return params.trim().match(/^simple-card\s+(.+)$/);
    },
    render: (tokens: Token[], idx: number) => {
      const token = tokens[idx];

      if (!token) {
        return "";
      }

      const info = token.info.trim();
      // 提取参数（去掉 "simple-card" 前缀）
      const paramsStr = info.replace(/^simple-card\s+/, "").trim();

      if (token.nesting === 1) {
        // 开始容器，将参数存储在 data 属性中
        return `<div class="markdown-simple-card-wrapper" data-params="${escapeAttribute(encodeURIComponent(paramsStr))}">`;
      } else {
        // 结束容器
        return `</div>`;
      }
    },
  });

  // 瀑布流图片容器（使用 columns 布局）
  md.use(container, "waterfall", {
    validate: (params: string) => {
      // 匹配 "waterfall" 格式（不需要额外参数）
      return params.trim().match(/^waterfall$/);
    },
    render: (tokens: Token[], idx: number) => {
      const token = tokens[idx];

      if (!token) {
        return "";
      }

      if (token.nesting === 1) {
        // 开始容器
        return `<div class="markdown-waterfall-wrapper">`;
      } else {
        // 结束容器
        return `</div>`;
      }
    },
  });

  mdInstance = md;
  return md;
}

const musicPlatforms: MusicPlatform[] = [
  // 网易云音乐
  {
    name: "netease",
    regex: /https:\/\/music\.163\.com\/(playlist|song|album|artist)\?id=(\d+)/i,
    getServer: () => "netease",
    getType: match => match[1] ?? "",
    getId: match => match[2] ?? "",
  },
  // QQ音乐
  {
    name: "tencent",
    regex: /https:\/\/y\.qq\.com\/n\/ryqq\/(playlist|songDetail|albumDetail)\/(\d+)/i,
    getServer: () => "tencent",
    getType: match => {
      const typeMap: Record<string, string> = {
        playlist: "playlist",
        songDetail: "song",
        albumDetail: "album",
      };
      return typeMap[match[1] ?? ""] || "song";
    },
    getId: match => match[2] ?? "",
  },
  // 酷我音乐
  {
    name: "kuwo",
    regex: /https:\/\/www\.kuwo\.cn\/(playlist|song|album)\/(\d+)/i,
    getServer: () => "kuwo",
    getType: match => match[1] ?? "",
    getId: match => match[2] ?? "",
  },
  // 酷狗音乐
  {
    name: "kugou",
    regex: /https:\/\/www\.kugou\.com\/(song|album|playlist)\/(\w+)\.html/i,
    getServer: () => "kugou",
    getType: match => match[1] ?? "",
    getId: match => match[2] ?? "",
  },
];

// 检测并转换音乐链接
function transformMusicLinks(content: string): string {
  let transformedContent = content;

  musicPlatforms.forEach(platform => {
    const regex = new RegExp(`\\[([^\\]]+)\\]\\(${platform.regex.source}\\)`, platform.regex.flags.includes("g") ? platform.regex.flags : `${platform.regex.flags}g`);
    transformedContent = transformedContent.replace(regex, (match, linkText, ...args) => {
      const matchArray = [match, ...args.slice(0, -2)] as RegExpMatchArray;
      const server = platform.getServer();
      const type = platform.getType(matchArray);
      const id = platform.getId(matchArray);

      if (id) {
        return `:::music ${server} | ${type} | ${id}:::`;
      }
      return match;
    });
  });

  return transformedContent;
}

export function renderSimpleMarkdown(content: string): string {
  if (!content) {
    return "";
  }

  return sanitizeHtml(simpleMd.render(content));
}

// 渲染 Markdown 内容
export async function renderMarkdown(content: string): Promise<string> {
  if (!content) {
    return "";
  }

  // 转换音乐链接为播放器容器
  const transformedContent = transformMusicLinks(content);

  const md = await createMarkdownInstance();
  return sanitizeHtml(md.render(transformedContent));
}
