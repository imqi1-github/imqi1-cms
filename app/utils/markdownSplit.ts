/**
 * Markdown 文本 ↔ 编辑器文档之间的"容器切分器"。
 *
 * 背景：服务端 server/utils/markdown.ts 用 markdown-it-container 渲染 `:::xxx ... :::`
 * 容器（实况照片/视频/音乐/卡片/折叠 等）。后台 Tiptap 富文本编辑器**不**在客户端
 * 复刻这套容器渲染，而是把每个 `:::` 容器当作一个**不透明原子节点**（CustomContainer），
 * 节点 attrs.raw 存它的**原始全文**，回写时原样吐回 → 容器部分字节级保真。
 *
 * 因此加载/回写边界需要把 markdown 串拆成两类段：
 *   - `md`：标准 markdown，喂给 tiptap-markdown 解析成普通块节点；
 *   - `container`：一整块 `:::` 容器原文，直接造成 CustomContainer 节点。
 *
 * 识别规则（行扫描）：
 *   1. 围栏代码块（``` / ~~~）内的 `:::` 视为字面量，不切分（技术文档里讲本语法时会用到）。
 *   2. 单行容器：一行内 `:::` 出现 ≥2 次，如 `:::music netease | song | 123 :::`
 *     （transformMusicLinks 产出的紧凑写法）—— 整行就是一段容器。
 *   3. 多行容器：`:::type 参数` 开，到下一个独立 `:::` 行闭；支持嵌套（如
 *      `:::details` 包 `:::callout`），用深度计数，外层吞掉内层全文。
 *   4. 其余行归入相邻的 `md` 段。
 */

import type { ContainerType, MarkdownSegment } from "~/types/markdown-editor";

/** 容器名标识符正则片段：字母开头，允许字母数字与连字符。 */
const CONTAINER_NAME = "[a-zA-Z][a-zA-Z0-9-]*";
/** 行首开启容器：:::type ... */
const CONTAINER_OPEN_RE = new RegExp(`^:::(${CONTAINER_NAME})\\b`);
/** 行首独立闭合：::: 后只有空白 */
const CONTAINER_CLOSE_RE = /^:::\s*$/;
/** 单行容器：行内出现 ≥2 个 :::（如 `:::music a | b | c :::` 即开即闭），净深度变化为 0 */
const isSingleLineContainer = (line: string): boolean => (line.match(/:::/g) ?? []).length >= 2;
/** 围栏代码块开启：可选缩进 + 3 个及以上 ` 或 ~ */
const FENCE_OPEN_RE = /^\s*(`{3,}|~{3,})/;

/**
 * 把 markdown 串拆成 md 段与 container 段的有序数组。
 *
 * 实现采用单次行扫描 + 围栏/深度状态机，O(n) 复杂度。各段按原文顺序拼接，
 * 容器段保留其完整原文（含外层 `:::`），标准段保留段内原文（仅去掉段间空行归一）。
 */
export function splitMarkdown(md: string): MarkdownSegment[] {
  if (!md) return [];

  const lines = md.split("\n");
  const segments: MarkdownSegment[] = [];
  let mdBuffer: string[] = [];
  let i = 0;

  const flushMd = () => {
    if (mdBuffer.length > 0) {
      segments.push({ kind: "md", text: mdBuffer.join("\n") });
      mdBuffer = [];
    }
  };

  while (i < lines.length) {
    const line = lines[i]!;

    // —— 1. 围栏代码块：内部的 ::: 视为字面量，整段并入 md ——
    const fenceMatch = line.match(FENCE_OPEN_RE);
    if (fenceMatch) {
      // CommonMark：闭合围栏必须是相同字符，且长度 ≥ 开启围栏；否则视为字面量。
      // 早期用固定 {3,} 会让 ```` 代码块内部一段 ``` 误闭合，破坏内嵌讲解代码。
      const openFence = fenceMatch[1]!;
      const fenceCloseRe = new RegExp(`^\\s*\\${openFence[0]!}{${openFence.length},}`);
      mdBuffer.push(line);
      i++;
      while (i < lines.length) {
        const inner = lines[i]!;
        mdBuffer.push(inner);
        i++;
        if (fenceCloseRe.test(inner)) {
          break;
        }
      }
      continue;
    }

    // —— 2. 容器开启行？——
    if (CONTAINER_OPEN_RE.test(line)) {
      // 单行容器：同一行 ::: 出现 ≥2 次（如 :::music a | b | c :::）
      if (isSingleLineContainer(line)) {
        flushMd();
        segments.push({ kind: "container", raw: line });
        i++;
        continue;
      }

      // 多行容器：收集到深度归零的闭合 :::
      flushMd();
      const rawLines: string[] = [line];
      i++;
      let depth = 1;
      let closed = false;
      while (i < lines.length) {
        const inner = lines[i]!;
        if (CONTAINER_CLOSE_RE.test(inner)) {
          depth -= 1;
          rawLines.push(inner);
          i++;
          if (depth === 0) {
            closed = true;
            break;
          }
        } else if (CONTAINER_OPEN_RE.test(inner) && !isSingleLineContainer(inner)) {
          depth += 1;
          rawLines.push(inner);
          i++;
        } else {
          // 含嵌套单行容器(如 :::music ... :::)时净深度不变，仅原样保留该行
          rawLines.push(inner);
          i++;
        }
      }
      if (closed) {
        segments.push({ kind: "container", raw: rawLines.join("\n") });
      } else {
        // 未闭合（到 EOF 仍 depth>0）：开启行及被吞内容回退为普通 md。服务端 markdown-it
        // 会把裸 ::: 当字面量渲染，这里同样当字面量；避免一个没闭合的 ::: 把后续整篇
        // 正文锁进不透明容器节点（字节仍逐字保留，无数据丢失）。
        mdBuffer.push(...rawLines);
      }
      continue;
    }

    // —— 4. 普通行 ——
    mdBuffer.push(line);
    i++;
  }

  flushMd();
  return segments;
}

/**
 * 从容器原文里提取类型标识符（`:::type` 的 type）。仅用于选占位块的图标/标签，
 * 不参与序列化；未知类型返回 null（调用方走默认展示）。
 */
export function deriveContainerType(raw: string): ContainerType | null {
  const m = raw.match(new RegExp(`^:::(${CONTAINER_NAME})`));
  if (!m) return null;
  return m[1] as ContainerType;
}
