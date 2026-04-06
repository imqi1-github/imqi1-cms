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
        light: "min-light",
        dark: "one-dark-pro",
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
      ],
      // 未找到语言时的 fallback
      fallbackLanguage: "bash",
      transformers: [transformerNotationHighlight(), transformerNotationDiff()],
    }),
  );

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

  // 悬浮解释容器
  md.use(container, "tooltip", {
    validate: (params: string) => {
      // 匹配 "tooltip 解释文本" 格式
      return params.trim().match(/^tooltip\s+(.+)$/);
    },
    render: (tokens: any[], idx: number) => {
      const info = tokens[idx].info.trim();
      // 提取解释文本（去掉 "tooltip" 前缀）
      let tooltipText = info.replace(/^tooltip\s+/, "").trim();

      if (tokens[idx].nesting === 1) {
        // 开始容器
        return `<span class="markdown-tooltip-wrapper" data-tooltip="${tooltipText}">`;
      } else {
        // 结束容器
        return `</span>`;
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

  mdInstance = md;
  return md;
}

// 渲染 Markdown 内容
export async function renderMarkdown(content: string): Promise<string> {
  if (!content) {
    return "";
  }

  const md = await createMarkdownInstance();
  return md.render(content);
}

// 预热 Shiki（在应用启动时调用）
export async function warmupMarkdownRenderer() {
  await createMarkdownInstance();
}
