import { Extension, Decoration } from "@tiptap/core";

/**
 * 查找匹配高亮 extension：把传入的 `matches`（文档绝对位置范围）渲染为 ProseMirror inline Decoration。
 *
 * 为什么不直接 setTextSelection 选中匹配：
 *   - setTextSelection 会抢 selection，用户的真实光标位置被替换；
 *   - .focus() 同时会触发 onTransaction → syncState 重新读 isActive，引发额外副作用链。
 * 用 Decoration 只画视觉样式，**不动文档模型、不动 selection、不动 focus**。
 * 用户在查找替换 input 里输入查询时，焦点与光标都留在原处不被拽走。
 *
 * 触发重算：
 *   - matches 由外部 Reactivity ref 提供，通过 `getMatches` getter 闭包读取；
 *   - 调用方在 matches 变化后调 `editor.commands.updateDecorations("findHighlight")`
 *     强制重算（manual 模式下默认不响应 tr.docChanged）。
 *
 * currentIndex：当前匹配下标（1-based）通过 `getCurrentIndex` 读取；仅对当前匹配加
 *  `find-match-current` class，其它匹配用 `find-match`。两套颜色让用户能一眼分辨当前 match。
 */
export interface FindHighlightOptions {
  /** 文档位置 matches 列表（绝对位置 from/to） */
  getMatches: () => Array<{ from: number; to: number }>;
  /** 当前匹配下标（1-based），0 表示无当前匹配 */
  getCurrentIndex: () => number;
}

const FIND_MATCH_CLASS = "find-match";
const FIND_MATCH_CURRENT_CLASS = "find-match-current";

/** Decoration.inline 的样式 attrs（class）。CSS 在 MarkdownEditor.vue 里。 */
function matchAttrs(isCurrent: boolean): { class: string } {
  return {
    class: isCurrent ? FIND_MATCH_CURRENT_CLASS : FIND_MATCH_CLASS,
  };
}

export const FindHighlight = Extension.create<FindHighlightOptions>({
  name: "findHighlight",

  addOptions() {
    return {
      getMatches: () => [],
      getCurrentIndex: () => 0,
    };
  },

  addDecorations() {
    return {
      // manual：仅在调用 editor.commands.updateDecorations("findHighlight") 时重算，
      // 不响应 doc 变化（用户在编辑器里输入不会触发本装饰重算）——避免每次输入都重算整篇 matches。
      update: "manual",
      create: () => {
        const matches = this.options.getMatches();
        const currentIndex = this.options.getCurrentIndex();
        // 跨多个文本节点（如容器内文本）的 match 在这里用单一 inline 装饰，
        // 仅 from/to 同节点时 ProseMirror 才会渲染。跨节点的 match 退化为仅第一段高亮——
        // 仍是视觉提示，且 scrollToCurrentMatch 会把用户带到该位置。
        const out = matches.flatMap((m, i): Decoration[] => {
          if (m.from >= m.to) return [];
          return [Decoration.Inline(m.from, m.to, matchAttrs(i + 1 === currentIndex))];
        });
        return out;
      },
    };
  },
});