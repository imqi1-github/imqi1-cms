/**
 * 把文章 markdown 正文转成 RSS 等场景用的纯文本。
 *
 * server/utils/markdown.ts 那套 renderMarkdown 是为前端富显示渲染的（Shiki 代码高亮、
 * 容器渲染成带 data 属性的 <div>），不适合直接拿来“转纯文本”——会把容器内部参数/HTML
 * 铺进文本。这里单独实现一条“正文 → 纯文本”管线：
 *
 *   1. 先把 `:::` 容器块**整块替换**为 `<中文类型>` 占位（丢弃容器内部内容）。
 *      容器识别规则与 app/utils/markdownSplit.ts 的 splitMarkdown 完全一致：
 *        - 围栏代码块（``` / ~~~）内的 `:::` 视为字面量，不替换；
 *        - 单行容器（同一行 `:::` 出现 ≥2 次，如 `:::music a | b | c :::`）；
 *        - 多行容器（`:::type` 开，到深度归零的独立 `:::` 闭，支持嵌套）；
 *        - 未闭合的 `:::` 回退为普通文本（避免误吞后续正文）。
 *      容器名 → 中文 label 与 app/components/markdown-editor/containerMeta.ts 的
 *      CONTAINER_META 保持一致（受控的服务端小段重复，不共享以免牵入客户端依赖）。
 *   2. 剩余 markdown 用一个 html:false 的 MarkdownIt 渲染成 HTML，再去标签 + 解码实体 +
 *      折叠空白 → 纯文本。占位 `<中文类型>` 在 html:false 下被 markdown-it 转义成
 *      `&lt;中文类型&gt;` 实体，去标签正则只匹配真标签碰不到它，最后解码实体恢复成
 *      字面的 `<中文类型>`。
 */
import MarkdownIt from "markdown-it";

// 容器名 → RSS 纯文本里的中文占位标签。
// 与服务端 server/utils/markdown.ts 注册的 10 种容器、客户端 containerMeta.ts 的 label 一致。
const CONTAINER_LABELS: Record<string, string> = {
  "live-photo": "实况照片",
  video: "视频",
  callout: "提示框",
  card: "链接卡片",
  "simple-card": "外链卡片",
  swiper: "轮播图",
  waterfall: "瀑布流",
  repo: "仓库卡片",
  music: "音乐播放器",
  details: "折叠区块",
};

/** 容器名标识符片段：字母开头，允许字母数字与连字符（与 splitMarkdown 一致）。 */
const CONTAINER_NAME = "[a-zA-Z][a-zA-Z0-9-]*";
/** 行首开启容器：:::type ... */
const CONTAINER_OPEN_RE = new RegExp(`^:::(${CONTAINER_NAME})\\b`);
/** 行首独立闭合：::: 后只有空白 */
const CONTAINER_CLOSE_RE = /^:::\s*$/;
/** 围栏代码块开启：可选缩进 + 3 个及以上 ` 或 ~ */
const FENCE_OPEN_RE = /^\s*(`{3,}|~{3,})/;

/** 由容器开启行（如 `:::music ...`）取占位文本，未知类型兜底为 `<自定义容器>`。 */
function containerPlaceholder(openLine: string): string {
  const m = openLine.match(new RegExp(`^:::(${CONTAINER_NAME})`));
  const type = m?.[1];
  const label = (type && CONTAINER_LABELS[type]) || "自定义容器";
  return `<${label}>`;
}

/**
 * 把所有 `:::` 容器块替换为 `<中文类型>` 占位；围栏代码块内的 `:::` 当字面量保留。
 * 单次行扫描 + 围栏/深度状态机，O(n)。逻辑与 app/utils/markdownSplit.ts 同源。
 */
function stripContainers(md: string): string {
  if (!md) return "";
  const lines = md.split("\n");
  const out: string[] = [];
  let i = 0;

  while (i < lines.length) {
    const line = lines[i]!;

    // —— 围栏代码块：内部 ::: 视为字面量，整段原样保留（CommonMark 闭合规则）——
    const fenceMatch = line.match(FENCE_OPEN_RE);
    if (fenceMatch) {
      const openFence = fenceMatch[1]!;
      // 闭合围栏必须是相同字符、长度 ≥ 开启围栏
      const fenceCloseRe = new RegExp(`^\\s*\\${openFence[0]!}{${openFence.length},}`);
      out.push(line);
      i++;
      while (i < lines.length) {
        const inner = lines[i]!;
        out.push(inner);
        i++;
        if (fenceCloseRe.test(inner)) break;
      }
      continue;
    }

    // —— 容器开启行 ——
    if (CONTAINER_OPEN_RE.test(line)) {
      // 单行容器：同一行 ::: 出现 ≥2 次（如 :::music a | b | c :::）
      const tripleCount = (line.match(/:::/g) ?? []).length;
      if (tripleCount >= 2) {
        out.push(containerPlaceholder(line));
        i++;
        continue;
      }

      // 多行容器：收集到深度归零的闭合 :::（支持嵌套，外层占位代表整块）
      const placeholder = containerPlaceholder(line);
      i++;
      let depth = 1;
      let closed = false;
      while (i < lines.length) {
        const inner = lines[i]!;
        if (CONTAINER_CLOSE_RE.test(inner)) {
          depth -= 1;
          i++;
          if (depth === 0) {
            closed = true;
            break;
          }
        } else if (CONTAINER_OPEN_RE.test(inner)) {
          depth += 1;
          i++;
        } else {
          i++;
        }
      }
      if (closed) {
        out.push(placeholder);
      } else {
        // 未闭合：开启行回退为普通文本（与 splitMarkdown 一致，避免误吞正文）
        out.push(line);
      }
      continue;
    }

    out.push(line);
    i++;
  }

  return out.join("\n");
}

// html:false：任何 <...> 都不当 HTML 标签（占位 `<中文类型>` 会被转义成实体保留下来，
// 去标签后再解码恢复）。breaks:true：软换行渲染成 <br>，去标签后用换行分隔段落。
const textMd = new MarkdownIt({
  html: false,
  linkify: false,
  typographer: false,
  breaks: true,
});

// 单次正则一次性解码常见命名实体——非递归，避免 &amp;lt; 被二次解码成 <。
// （先解 &amp; 之外的实体，&amp; 在同一次扫描里独立替换，不作用到别的匹配结果上。）
const ENTITY_RE = /&(amp|lt|gt|quot|#39|#x27|apos|nbsp);/g;
function decodeEntities(s: string): string {
  return s.replace(ENTITY_RE, (m, name: string) => {
    switch (name) {
      case "amp":
        return "&";
      case "lt":
        return "<";
      case "gt":
        return ">";
      case "quot":
        return '"';
      case "apos":
      case "#39":
      case "#x27":
        return "'";
      case "nbsp":
        return " ";
      default:
        return m;
    }
  });
}

/** HTML 串压成纯文本：块级/换行标签先转成换行避免粘连 → 去所有标签 → 解码实体。 */
function htmlToText(html: string): string {
  const withBreaks = html
    .replace(/<\/(p|div|section|article|li|ul|ol|h[1-6]|blockquote|pre|tr|thead|tbody|table)\s*>/gi, "\n")
    .replace(/<br\s*\/?>/gi, "\n");
  const noTags = withBreaks.replace(/<[^>]*>/g, "");
  return decodeEntities(noTags);
}

/** markdown 正文 → 纯文本：`:::` 容器整块换 `<中文类型>` 占位，其余 markdown 渲染后去标签。 */
export function markdownToPlainText(md: string | null | undefined): string {
  if (!md) return "";
  const stripped = stripContainers(md);
  const html = textMd.render(stripped);
  let text = htmlToText(html);
  // 折叠空白：连续 ≥3 换行压成 2 个、清掉行尾空白、首尾 trim
  text = text
    .replace(/\r\n/g, "\n")
    .replace(/\n{3,}/g, "\n\n")
    .replace(/[ \t]+\n/g, "\n")
    .trim();
  return text;
}
