import { CodeBlockLowlight } from "@tiptap/extension-code-block-lowlight";
import { VueNodeViewRenderer } from "@tiptap/vue-3";
import { common, createLowlight } from "lowlight";

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
 * lowlight 实例用 common 预置 37 种常见语言（js/ts/python/go/rust/java/c/cpp/
 * json/yaml/sql/bash/html(xml)/css/markdown 等），覆盖前台 Shiki 支持的大头；
 * 其余语言（toml/scala/powershell/vue 等）在编辑器里以纯文本呈现，前台仍由 Shiki 高亮。
 * 语言输入框留空或填未注册语言时，插件会 highlightAuto 尽力推断（lowlight 默认行为）。
 */
const lowlight = createLowlight(common);

export const CodeBlockLowlightWithLang = CodeBlockLowlight.extend({
  addNodeView() {
    return VueNodeViewRenderer(CodeBlockNodeView);
  },
}).configure({ lowlight });
