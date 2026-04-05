import MarkdownIt from "markdown-it";
import Shiki from "@shikijs/markdown-it";
import { transformerNotationHighlight, transformerNotationDiff } from "@shikijs/transformers";

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

  // 自定义图片渲染规则（添加 data-fancybox 属性）
  md.renderer.rules.image = (tokens: any[], idx: number, options: any, env: any, self: any) => {
    const token = tokens[idx];
    token.attrSet("loading", "lazy");
    token.attrSet("class", "markdown-image");
    token.attrSet("data-fancybox", "gallery");
    const alt = token.attrGet("alt") || "";
    if (alt) {
      token.attrSet("data-caption", alt);
    }
    return self.renderToken(tokens, idx, options);
  };

  // 配置 Shiki（只加载常见语言）
  md.use(
    await Shiki({
      themes: {
        light: "min-light",
        dark: "vitesse-dark",
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
