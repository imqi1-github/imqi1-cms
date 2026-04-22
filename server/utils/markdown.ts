import MarkdownIt from "markdown-it";
import Shiki from "@shikijs/markdown-it";
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
import ruby from "@shikijs/langs/ruby";
import go from "@shikijs/langs/go";
import rust from "@shikijs/langs/rust";
import swift from "@shikijs/langs/swift";
import kotlin from "@shikijs/langs/kotlin";
import scala from "@shikijs/langs/scala";
import yaml from "@shikijs/langs/yaml";
import toml from "@shikijs/langs/toml";
import markdown from "@shikijs/langs/markdown";
import vue from "@shikijs/langs/vue";
import tsx from "@shikijs/langs/tsx";
import jsx from "@shikijs/langs/jsx";
import mermaid from "@shikijs/langs/mermaid";
import ini from "@shikijs/langs/ini";
import powershell from "@shikijs/langs/powershell";

import islandLightTheme from '@/shiki/island_light'
import islandDarkTheme from '@/shiki/island_dark'

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
  md.renderer.rules.link_open = (tokens: any[], idx: number, options: any, env: any, self: any) => {
    const aIndex = tokens[idx].attrIndex("target");
    if (aIndex < 0) {
      tokens[idx].attrPush(["target", "_blank"]);
    } else {
      tokens[idx].attrs[aIndex][1] = "_blank";
    }
    const relIndex = tokens[idx].attrIndex("rel");
    if (relIndex < 0) {
      tokens[idx].attrPush(["rel", "noopener noreferrer"]);
    }
    return self.renderToken(tokens, idx, options);
  };

  // 自定义图片渲染规则（包装成 figure 并添加标题）
  md.renderer.rules.image = (tokens: any[], idx: number, options: any, env: any, self: any) => {
    const token = tokens[idx];
    token.attrSet("loading", "lazy");
    token.attrSet("class", "markdown-image");
    token.attrSet("data-fancybox", "gallery");
    const alt = token.content || "";
    if (alt) {
      token.attrSet("data-caption", alt);
    }

    // 先渲染图片标签
    const imgHtml = self.renderToken(tokens, idx, options);

    // 如果有 alt 文本，包装成 figure 并添加 figcaption
    if (alt) {
      return `<figure class="markdown-figure">${imgHtml}<figcaption class="markdown-figcaption">${alt}</figcaption></figure>`;
    }

    return imgHtml;
  };

  // 配置 Shiki（只加载常见语言）
  md.use(
    await Shiki({
      themes: {
        light: islandLightTheme,
        dark: islandDarkTheme,
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
        ruby,
        go,
        rust,
        swift,
        kotlin,
        scala,
        yaml,
        toml,
        markdown,
        vue,
        tsx,
        jsx,
        mermaid,
        ini,
        powershell,
      ],
      // 未找到语言时的 fallback
      fallbackLanguage: "text",
      transformers: [transformerNotationHighlight(), transformerNotationDiff()],
    }),
  );

  // 自定义代码块渲染规则 - 处理 "语言+文件名" 格式
  const defaultFence = md.renderer.rules.fence || function(tokens: any[], idx: number, options: any, env: any, self: any) {
    return self.renderToken(tokens, idx, options);
  };

  md.renderer.rules.fence = (tokens: any[], idx: number, options: any, env: any, self: any) => {
    const token = tokens[idx];
    const info = token.info || "";

    // 检测是否为 "语言+文件名" 格式 (如 "js+main.js")
    if (info.includes("+")) {
      const parts = info.split("+");
      const lang = parts[0];
      const fileName = parts.slice(1).join("+");

      // 临时修改 info 为实际语言，让 Shiki 正确高亮
      token.info = lang;

      // 调用原始渲染器
      let result = defaultFence(tokens, idx, options, env, self);

      // 恢复原始 info
      token.info = info;

      // 修改渲染结果中的 class，保留完整的 "语言+文件名" 信息
      result = result.replace(
        `class="language-${lang}"`,
        `class="language-${info}"`
      );

      return result;
    }

    return defaultFence(tokens, idx, options, env, self);
  };

  // 配置容器插件（用于折叠等功能）
  md.use(container, "details", {
    validate: (params: string) => {
      // 只匹配以 "details" 开头的内容
      return params.trim().match(/^details\s+(.*)$/);
    },
    render: (tokens: any[], idx: number) => {
      const info = tokens[idx].info.trim();
      // 提取标题（去掉 "details" 前缀）
      let summary = info.replace(/^details\s+/, "").trim() || "展开";

      if (tokens[idx].nesting === 1) {
        // 开始容器
        return `<div class="markdown-details-wrapper" data-summary="${summary}">`;
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
    render: (tokens: any[], idx: number) => {
      const info = tokens[idx].info.trim();
      // 提取视频 URL（去掉 "video" 前缀）
      let url = info.replace(/^video\s+/, "").trim();

      if (tokens[idx].nesting === 1) {
        // 开始容器
        return `<div class="markdown-video-wrapper" data-url="${url}">`;
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
    render: (tokens: any[], idx: number) => {
      const info = tokens[idx].info.trim();
      // 提取类型（去掉 "callout" 前缀）
      let type = info.replace(/^callout\s+/, "").trim();

      if (tokens[idx].nesting === 1) {
        // 开始容器
        return `<div class="markdown-callout-wrapper" data-type="${type}">`;
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
    render: (tokens: any[], idx: number) => {
      const info = tokens[idx].info.trim();
      // 提取参数（去掉 "card" 前缀）
      let paramsStr = info.replace(/^card\s+/, "").trim();

      if (tokens[idx].nesting === 1) {
        // 开始容器，将参数存储在 data 属性中
        return `<div class="markdown-card-wrapper" data-params="${encodeURIComponent(paramsStr)}">`;
      } else {
        // 结束容器
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
    render: (tokens: any[], idx: number) => {
      if (tokens[idx].nesting === 1) {
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
    render: (tokens: any[], idx: number) => {
      const info = tokens[idx].info.trim();
      // 提取仓库 URL（去掉 "repo" 前缀）
      let url = info.replace(/^repo\s+/, "").trim();

      if (tokens[idx].nesting === 1) {
        // 开始容器
        return `<div class="markdown-repo-wrapper" data-url="${url}">`;
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
    render: (tokens: any[], idx: number) => {
      const info = tokens[idx].info.trim();
      // 提取参数（去掉 "music" 前缀）
      let paramsStr = info.replace(/^music\s+/, "").trim();

      if (tokens[idx].nesting === 1) {
        // 开始容器，将参数存储在 data 属性中
        return `<div class="markdown-music-wrapper" data-params="${encodeURIComponent(paramsStr)}">`;
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
    render: (tokens: any[], idx: number) => {
      const info = tokens[idx].info.trim();
      // 提取参数（去掉 "simple-card" 前缀）
      let paramsStr = info.replace(/^simple-card\s+/, "").trim();

      if (tokens[idx].nesting === 1) {
        // 开始容器，将参数存储在 data 属性中
        return `<div class="markdown-simple-card-wrapper" data-params="${encodeURIComponent(paramsStr)}">`;
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
    render: (tokens: any[], idx: number) => {
      if (tokens[idx].nesting === 1) {
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

// 音乐平台 URL 解析规则
interface MusicPlatform {
  name: string;
  regex: RegExp;
  getServer: () => string;
  getType: (match: RegExpMatchArray) => string;
  getId: (match: RegExpMatchArray) => string;
}

const musicPlatforms: MusicPlatform[] = [
  // 网易云音乐
  {
    name: "netease",
    regex: /https:\/\/music\.163\.com\/(playlist|song|album|artist)\?id=(\d+)/i,
    getServer: () => "netease",
    getType: (match) => match[1],
    getId: (match) => match[2]
  },
  // QQ音乐
  {
    name: "tencent",
    regex: /https:\/\/y\.qq\.com\/n\/ryqq\/(playlist|songDetail|albumDetail)\/(\d+)/i,
    getServer: () => "tencent",
    getType: (match) => {
      const typeMap: Record<string, string> = {
        playlist: "playlist",
        songDetail: "song",
        albumDetail: "album"
      };
      return typeMap[match[1]] || "song";
    },
    getId: (match) => match[2]
  },
  // 酷我音乐
  {
    name: "kuwo",
    regex: /https:\/\/www\.kuwo\.cn\/(playlist|song|album)\/(\d+)/i,
    getServer: () => "kuwo",
    getType: (match) => match[1],
    getId: (match) => match[2]
  },
  // 酷狗音乐
  {
    name: "kugou",
    regex: /https:\/\/www\.kugou\.com\/(song|album|playlist)\/(\w+)\.html/i,
    getServer: () => "kugou",
    getType: (match) => match[1],
    getId: (match) => match[2]
  }
];

// 检测并转换音乐链接
function transformMusicLinks(content: string): string {
  let transformedContent = content;

  musicPlatforms.forEach(platform => {
    const regex = new RegExp(`\\[([^\\]]+)\\]\\(${platform.regex.source}\\)`, 'g');
    transformedContent = transformedContent.replace(regex, (match, linkText, ...args) => {
      const matchArray = args.slice(0, -2) as RegExpMatchArray;
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

// 渲染 Markdown 内容
export async function renderMarkdown(content: string): Promise<string> {
  if (!content) {
    return "";
  }

  // 转换音乐链接为播放器容器
  const transformedContent = transformMusicLinks(content);

  const md = await createMarkdownInstance();
  return md.render(transformedContent);
}

// 预热 Shiki（在应用启动时调用）
export async function warmupMarkdownRenderer() {
  await createMarkdownInstance();
}
