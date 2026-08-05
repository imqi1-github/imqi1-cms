/**
 * CustomContainer —— 自定义 `:::xxx` 容器对应的 Tiptap 原子块节点。
 *
 * 设计要点：
 *   - `atom: true`：作为一个整体被选中/移动/删除，内部不可编辑（contenteditable=false）；
 *     原始 `:::` 全文存在 attrs.raw，回写时原样吐回（见下方 markdown.serialize）。
 *   - attrs.type 仅用于选占位块的图标/标签（由 deriveContainerType 从 raw 推导），不参与序列化。
 *   - NodeView（CustomContainerNodeView.vue）覆盖渲染：展示图标 + 标签 + 截断原文 +
 *     「编辑源码」按钮（弹窗改 raw）。
 *   - 序列化（editor→markdown）：注册 markdown.serialize 规则，直接 state.write(raw) 原样输出，
 *     保证容器部分与 server/utils/markdown.ts 的语法字节级一致。
 *
 * 解析（markdown→editor）侧不在此节点处理：app/components/MarkdownEditor.vue 用 splitMarkdown
 * 把容器段切出来，直接 nodeFromJSON 造原子节点插入文档，绕过 markdown-it（避免 `:::` 被当字面段落）。
 */

import { mergeAttributes, Node } from "@tiptap/core";
import { VueNodeViewRenderer, type NodeViewProps } from "@tiptap/vue-3";
import type { Node as ProseMirrorNode } from "@tiptap/pm/model";

import CustomContainerNodeView from "../CustomContainerNodeView.vue";

/** prosemirror-markdown 序列化器 state 用到的最小子集（避免引入其类型依赖）。 */
interface MarkdownSerializerStateLike {
  write(content: string): void;
  closeBlock(node: ProseMirrorNode): void;
}

export const CustomContainer = Node.create({
  name: "customContainer",
  group: "block",
  atom: true,
  selectable: true,
  isolating: true,

  addAttributes() {
    return {
      raw: {
        default: "",
      },
      type: {
        default: "",
      },
    };
  },

  parseHTML() {
    return [{ tag: "div[data-custom-container]" }];
  },

  renderHTML({ HTMLAttributes }) {
    return ["div", mergeAttributes(HTMLAttributes, { "data-custom-container": "" })];
  },

  addNodeView() {
    return VueNodeViewRenderer(CustomContainerNodeView as unknown as new () => NodeViewProps);
  },

  addStorage() {
    return {
      markdown: {
        serialize(state: MarkdownSerializerStateLike, node: ProseMirrorNode) {
          // 原样输出容器原文（write 不做转义），确保与磁盘上的 ::: 语法完全一致。
          state.write(node.attrs.raw as string);
          state.closeBlock(node);
        },
      },
    };
  },
});
