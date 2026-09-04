import { CodeBlockLowlight } from "@tiptap/extension-code-block-lowlight";
import { VueNodeViewRenderer } from "@tiptap/vue-3";
import bash from "highlight.js/lib/languages/bash";
import c from "highlight.js/lib/languages/c";
import cpp from "highlight.js/lib/languages/cpp";
import css from "highlight.js/lib/languages/css";
import ini from "highlight.js/lib/languages/ini";
import java from "highlight.js/lib/languages/java";
import javascript from "highlight.js/lib/languages/javascript";
import json from "highlight.js/lib/languages/json";
import markdown from "highlight.js/lib/languages/markdown";
import php from "highlight.js/lib/languages/php";
import python from "highlight.js/lib/languages/python";
import sql from "highlight.js/lib/languages/sql";
import typescript from "highlight.js/lib/languages/typescript";
import xml from "highlight.js/lib/languages/xml";
import yaml from "highlight.js/lib/languages/yaml";
import { createLowlight } from "lowlight";

import CodeBlockNodeView from "../CodeBlockNodeView.vue";

/**
 * CodeBlockLowlight + 语言选择 NodeView。
 *
 * 背景：CodeBlockWithLang 仅在 StarterKit CodeBlock 上叠加了右上角语言输入框，
 * 编辑器内代码块始终是单色等宽块（见 MarkdownEditor.vue 旧注释「无 Shiki 高亮」）。
 * 这里换成 CodeBlockLowlight 接入 lowlight（highlight.js）做编辑态语法高亮：
 *
 * - CodeBlockLowlight 仅覆写 addOptions / addProseMirrorPlugins，注入一个用
 *   Decoration.inline 给每个 token 画 `<span class="hljs-xxx">` 的插件。高亮走
 *   ProseMirror decoration，**不碰文档模型**，tiptap-markdown 往返（```lang\n代码）
 *   零差异；节点名仍是 codeBlock、language 属性照旧，parse/render markdown 与
 *   setCodeBlock / toggleCodeBlock / Tab 缩进全部继承自 CodeBlock 基类，无需重写。
 * - 再覆盖 addNodeView 复用原 NodeView（语言输入框），装饰会照常渲染进 contentDOM。
 *
 * lowlight 实例只注册与前台 Shiki 对齐的语言子集（js/ts/python/java/c/cpp/css/
 * xml(html)/json/bash/sql/php/yaml/markdown/ini 共 15 种），编辑态高亮覆盖与发布后
 * 正文一致；其余语言（go/rust/swift/toml/vue/tsx 等）编辑器里走 highlightAuto 尽力
 * 推断或纯文本呈现，前台仍由 Shiki 高亮。语言输入框留空或填未注册语言时同理。
 * （按前台 Shiki 语义裁剪掉编辑器独有的大语言语法，砍掉编辑页 chunk 体积。）
 */
const lowlight = createLowlight({
  bash,
  c,
  cpp,
  css,
  ini,
  java,
  javascript,
  json,
  markdown,
  php,
  python,
  sql,
  typescript,
  xml,
  yaml,
});

export const CodeBlockLowlightWithLang = CodeBlockLowlight.extend({
  addNodeView() {
    return VueNodeViewRenderer(CodeBlockNodeView);
  },
}).configure({ lowlight });
