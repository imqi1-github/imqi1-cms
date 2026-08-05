import { CodeBlock } from "@tiptap/extension-code-block";
import { VueNodeViewRenderer } from "@tiptap/vue-3";

import CodeBlockNodeView from "../CodeBlockNodeView.vue";

/**
 * CodeBlock + 语言选择 NodeView。
 *
 * 背景：StarterKit 自带的 CodeBlock 能在往返中保留 language（parseHTML 从
 * `<code class="language-js">` 提取，renderMarkdown 输出 ` ```js `），但
 * addCommands 只有 setCodeBlock/toggleCodeBlock，**没有任何修改语言的入口**。
 * textarea 时代作者可以直接改 ``` 后的语言标记，迁移到 Tiptap 后代码块整体
 * 化、语言标记看不见也改不了。
 *
 * 这里用 CodeBlock.extend 仅覆盖 addNodeView，其余（attributes / parseHTML /
 * renderHTML / parseMarkdown / renderMarkdown / input rule / 快捷键 / Tab 缩进）
 * 全部沿用原扩展，所以 tiptap-markdown 往返不受影响。NodeView 只是在 `<pre>`
 * 右上角叠加一个纯文本语言输入框（自由手输 Shiki 支持的任意语言），改值走 updateAttributes。
 */
export const CodeBlockWithLang = CodeBlock.extend({
  addNodeView() {
    return VueNodeViewRenderer(CodeBlockNodeView);
  },
});
