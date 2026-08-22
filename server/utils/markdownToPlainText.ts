/**
 * 把文章 markdown 正文转成 RSS 等场景用的纯文本。
 *
 * server/utils/markdown.ts 那套 renderMarkdown 是为前端富显示渲染的（Shiki 代码高亮、
 * 容器渲染成带 data 属性的 <div>），不适合直接拿来“转纯文本”——会把容器内部参数/HTML
 * 铺进文本。这里单独实现一条“正文 → 纯文本”管线：
 *
 *   1. 先做一次行扫描的状态机（与 app/utils/markdownSplit.ts 的 splitMarkdown 同源）：
 *      - 围栏代码块（``` / ~~~）整块替换为 `<代码块：语言xx，共xx行>`（无语言则
 *        `<代码块：共xx行>`）；围栏内的 `:::` 视为字面量，不替换。
 *      - `:::` 容器按类型替换：
 *          callout（四种提示）→ 保留内部正文原始文本（丢弃 open/close 行）；
 *          轮播图/瀑布流    → 每张图展开成一行 `<图片：标题>`（#live 实况图 → `<实况照片：标题>`）；
 *          live-photo       → `<实况照片：标题>`；
 *          repo             → `<GitHub仓库：owner/repo>` / `<Gitee仓库：owner/repo>`；
 *          music            → `<音乐：网易云，id=xxx>` / `<音乐列表：QQ音乐，id=xxx>`（纯静态，不拉标题）；
 *          card/simple-card → `<链接卡片：标题>` / `<外链卡片：标题>`（行间卡片元素）；
 *          details          → `<折叠区块：标题>`；
 *          其余（video）    → 各自的中文占位。
 *      最后整体对中文与英文/数字相邻处补空格（如 `<代码块：语言 js，共 5 行>`）。
 *      单行容器（同一行 `:::` 出现 ≥2 次）同样替换；未闭合的 `:::` 回退为普通文本（避免误吞正文）。
 *   2. 剩余 markdown 用一个 html:false 的 MarkdownIt 渲染成 HTML：
 *      - `<table>` 整块 → `<表格：共x行y列>`（统计 <tr> 与最多单元格数）；
 *      - 缩进代码块 `<pre>` → `<代码块：共xx行>`；
 *      - 行内 `<img>` → `<图片：标题>`（src 含 #live 或 alt 含 [live] → `<实况照片：标题>`）；
 *      再去标签 + 解码实体 + 折叠空白 → 纯文本。
 *
 *   占位 `<中文类型>` 在 html:false 下被 markdown-it 转义成 `&lt;中文类型&gt;` 实体，
 *   去标签正则只匹配真标签碰不到它，最后 decodeEntities 恢复成字面的 `<中文类型>`。
 *   容器名 → 中文 label 与 app/components/markdown-editor/containerMeta.ts 的
 *   CONTAINER_META 保持一致（受控的服务端小段重复，不共享以免牵入客户端依赖）。
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

/** 图片画廊类容器（轮播图/瀑布流）：内容每行一条 `url | 标题`。 */
const IMAGE_GALLERY_CONTAINERS = new Set(["swiper", "waterfall"]);

/** 围栏代码块 → `<代码块：语言xx，共xx行>`；语言取围栏 info 第一段（`js+file.ts` → `js`），无语言略去。 */
function codeBlockPlaceholder(openLine: string, codeLines: string[]): string {
  const lines = [...codeLines];
  if (lines.length > 0 && lines[lines.length - 1]!.trim() === "") lines.pop();
  const infoMatch = openLine.match(/^\s*(?:`{3,}|~{3,})\s*(.*)$/);
  const lang = (infoMatch?.[1] ?? "").trim().split(/[\s+]/)[0] ?? "";
  const lineCount = lines.length;
  return lang ? `<代码块：语言${lang}，共${lineCount}行>` : `<代码块：共${lineCount}行>`;
}

/** 轮播图/瀑布流内容行（每条 `url | 标题`）展开成一行一个图片占位；#live 实况图用实况照片占位。 */
function galleryToImagePlaceholders(contentLines: string[]): string {
  const parts: string[] = [];
  for (const line of contentLines) {
    const t = line.trim();
    if (t === "" || CONTAINER_CLOSE_RE.test(t) || CONTAINER_OPEN_RE.test(t)) continue;
    const sep = t.indexOf(" | ");
    const url = (sep >= 0 ? t.slice(0, sep) : t).trim();
    const title = (sep >= 0 ? t.slice(sep + 3) : "").trim().replace(/\[live\]/gi, "").trim();
    const isLive = /#live\b/i.test(url) || /\[live\]/i.test(t);
    const kind = isLive ? "实况照片" : "图片";
    parts.push(title ? `<${kind}：${title}>` : `<${kind}>`);
  }
  return parts.join("\n");
}

const MUSIC_KIND_LABELS: Record<string, string> = {
  song: "音乐",
  playlist: "音乐列表",
  album: "音乐列表",
  artist: "音乐列表",
};

/** 音乐平台 token → 中文名（RSS 里更可读）；未知平台回退原 token。 */
const MUSIC_PLATFORM_LABELS: Record<string, string> = {
  netease: "网易云",
  tencent: "QQ音乐",
  kuwo: "酷我",
  kugou: "酷狗",
  baidu: "百度",
  xiami: "虾米",
};

/** `:::music ...` 参数 → `<音乐：平台，id=xxx>`；纯静态不拉标题（md 里本就没有标题）。 */
function musicPlaceholder(paramsStr: string): string {
  const s = paramsStr.trim();
  // 形式1：:::music auto https://...（URL 里带平台/类型/id）
  const autoM = s.match(/^auto\s+(\S+)/);
  if (autoM) {
    const parsed = parseMusicUrl(autoM[1]!);
    if (parsed) return musicKindPlaceholder(parsed.kind, parsed.platform, parsed.id);
    return "<音乐>";
  }
  // 形式2：:::music song netease 123456
  const m = s.match(/^(song|playlist|album|artist)\s+(\S+)\s+(\S+)/);
  if (m) {
    return musicKindPlaceholder(m[1]!, m[2]!, m[3]!);
  }
  return "<音乐>";
}

function musicKindPlaceholder(kind: string, platform: string, id: string): string {
  const label = MUSIC_KIND_LABELS[kind] || "音乐";
  const platformLabel = MUSIC_PLATFORM_LABELS[platform] || platform;
  return `<${label}：${platformLabel}，id=${id}>`;
}

/** 从网易云/QQ 音乐 URL 里解析出类型、平台、id（与服务端 markdown.ts 的 musicPlatforms 同源）。 */
function parseMusicUrl(url: string): { kind: string; platform: string; id: string } | null {
  const neteaseM = url.match(/music\.163\.com\/(playlist|song|album|artist)\?id=(\d+)/i);
  if (neteaseM) return { kind: neteaseM[1]!, platform: "netease", id: neteaseM[2]! };
  const tencentM = url.match(/y\.qq\.com\/n\/ryqq\/(playlist|songDetail|albumDetail)\/(\d+)/i);
  if (tencentM) {
    const typeMap: Record<string, string> = { playlist: "playlist", songDetail: "song", albumDetail: "album" };
    return { kind: typeMap[tencentM[1]!] || "song", platform: "tencent", id: tencentM[2]! };
  }
  return null;
}

/** `:::repo https://github.com/owner/repo` → `<GitHub仓库：owner/repo>`。 */
function repoPlaceholder(paramsStr: string): string {
  const m = paramsStr.trim().match(/^(?:https?:\/\/)?(?:www\.)?(github|gitee)\.com\/([^\s/]+\/[^\s/]+)/i);
  if (m) {
    const host = m[1]!.toLowerCase() === "github" ? "GitHub" : "Gitee";
    return `<${host}仓库：${m[2]!.replace(/\/+$/, "")}>`;
  }
  return "<仓库卡片>";
}

/** `:::live-photo URL 标题` → `<实况照片：标题>`（URL 后文本即标题）。 */
function livePhotoPlaceholder(openLine: string): string {
  const rest = openLine.replace(/^:::live-photo\s+/, "").trim();
  const title = rest.replace(/^\S+\s*/, "").trim();
  return title ? `<实况照片：${title}>` : "<实况照片>";
}

/** 由容器开启行（如 `:::music ...`）取占位文本；轮播图/瀑布流展开成图片占位，未知类型兜底为 `<自定义容器>`。 */
function containerPlaceholder(openLine: string, contentLines: string[] = []): string {
  const m = openLine.match(new RegExp(`^:::(${CONTAINER_NAME})`));
  const type = m?.[1];
  const label = (type && CONTAINER_LABELS[type]) || "自定义容器";
  if (!type) return `<${label}>`;

  if (type === "live-photo") return livePhotoPlaceholder(openLine);
  if (type === "repo") return repoPlaceholder(openLine.replace(/^:::repo\s+/, ""));
  if (type === "music") return musicPlaceholder(openLine.replace(/^:::music\s+/, ""));
  if (type === "details") {
    const title = openLine.replace(/^:::details\s*/, "").trim();
    return title ? `<折叠区块：${title}>` : "<折叠区块>";
  }
  // 链接卡片/外链卡片：行间卡片元素，用 `<链接卡片：标题>` / `<外链卡片：标题>` 格式。
  if (type === "card" || type === "simple-card") {
    const params = openLine.replace(new RegExp(`^:::${type}\\s+`), "").trim();
    const parts = params.split(/\s*\|\s*/);
    const title = parts[1]?.trim() ?? "";
    const label = CONTAINER_LABELS[type] || "卡片";
    return title ? `<${label}：${title}>` : `<${label}>`;
  }

  // 轮播图/瀑布流：逐张展开为图片占位（无有效条目则退回中文占位）
  if (IMAGE_GALLERY_CONTAINERS.has(type) && contentLines.length > 0) {
    const expanded = galleryToImagePlaceholders(contentLines);
    if (expanded) return expanded;
  }
  return `<${label}>`;
}

/**
 * 把所有 `:::` 容器块替换为占位；围栏代码块整块替换为代码块占位。单次行扫描状态机，O(n)。
 * 逻辑与 app/utils/markdownSplit.ts 同源。
 */
function stripContainers(md: string): string {
  if (!md) return "";
  const lines = md.split("\n");
  const out: string[] = [];
  let i = 0;

  while (i < lines.length) {
    const line = lines[i]!;

    // —— 围栏代码块：整块替换为代码块占位（内部 ::: 视为字面量，CommonMark 闭合规则）——
    const fenceMatch = line.match(FENCE_OPEN_RE);
    if (fenceMatch) {
      const openFence = fenceMatch[1]!;
      // 闭合围栏必须是相同字符、长度 ≥ 开启围栏
      const fenceCloseRe = new RegExp(`^\\s*\\${openFence[0]!}{${openFence.length},}`);
      const codeLines: string[] = [];
      i++;
      let closed = false;
      while (i < lines.length) {
        const inner = lines[i]!;
        if (fenceCloseRe.test(inner)) {
          closed = true;
          i++;
          break;
        }
        codeLines.push(inner);
        i++;
      }
      if (closed) {
        out.push(codeBlockPlaceholder(line, codeLines));
      } else {
        // 未闭合：开启行与代码行都回退为普通文本
        out.push(line, ...codeLines);
      }      continue;
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

      // 多行容器：收集到深度归零的闭合 :::（支持嵌套）。同时收集内容行供轮播图/瀑布流展开。
      const contentLines: string[] = [];
      i++;
      let depth = 1;
      let closed = false;
      while (i < lines.length) {
        const inner = lines[i]!;
        if (CONTAINER_CLOSE_RE.test(inner)) {
          depth -= 1;
          i++;
          contentLines.push(inner);
          if (depth === 0) {
            closed = true;
            break;
          }
        } else if (CONTAINER_OPEN_RE.test(inner)) {
          depth += 1;
          i++;
          contentLines.push(inner);
        } else {
          contentLines.push(inner);
          i++;
        }
      }
      if (closed) {
        const type = line.match(new RegExp(`^:::(${CONTAINER_NAME})`))?.[1];
        if (type === "callout") {
          // 四种提示：保留内部正文原始文本（丢弃 open/close 行）
          for (const inner of contentLines) {
            if (CONTAINER_CLOSE_RE.test(inner) || CONTAINER_OPEN_RE.test(inner)) continue;
            out.push(inner);
          }
        } else {
          out.push(containerPlaceholder(line, contentLines));
        }
      } else {
        // 未闭合：开启行与收集到的内容行都回退为普通文本（与 splitMarkdown 一致，避免误吞正文）
        out.push(line, ...contentLines);
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

/** <img> → 图片占位：`<图片：alt>`（alt/title 取其一），无标题仅 `<图片>`；src 含 #live（或 alt/title 含 [live]）→ 实况照片占位。
 *  占位以实体形式输出，避免被下方去标签正则吃掉，末次 decodeEntities 恢复字面。 */
const IMG_TAG_RE = /<img\b[^>]*>/gi;
const attrRe = (name: string) => new RegExp(`\\b${name}\\s*=\\s*("([^"]*)"|'([^']*)')`, "i");

function imagesToPlaceholders(html: string): string {
  return html.replace(IMG_TAG_RE, (tag) => {
    const altM = tag.match(attrRe("alt"));
    const alt = altM?.[2] ?? altM?.[3] ?? "";
    const titleM = tag.match(attrRe("title"));
    const title = titleM?.[2] ?? titleM?.[3] ?? "";
    const srcM = tag.match(attrRe("src"));
    const src = srcM?.[2] ?? srcM?.[3] ?? "";
    const isLive = /#live\b/i.test(src) || /\[live\]/i.test(alt) || /\[live\]/i.test(title);
    const kind = isLive ? "实况照片" : "图片";
    const label = (alt || title).trim().replace(/\[live\]/gi, "").trim();
    return label ? `&lt;${kind}：${label}&gt;` : `&lt;${kind}&gt;`;
  });
}

/** 整个 <table> 块 → `<表格：共x行y列>` 占位（行=<tr> 数，列=单行最多单元格数）。实体输出防去标签。 */
const TABLE_RE = /<table\b[^>]*>[\s\S]*?<\/table>/gi;
function tablesToPlaceholders(html: string): string {
  return html.replace(TABLE_RE, block => {
    const rows = (block.match(/<tr\b/gi) || []).length;
    let cols = 0;
    for (const rowBlock of block.match(/<tr\b[\s\S]*?<\/tr>/gi) || []) {
      const c = (rowBlock.match(/<(?:td|th)\b/gi) || []).length;
      if (c > cols) cols = c;
    }
    return rows > 0 ? `&lt;表格：共${rows}行${cols}列&gt;` : "&lt;表格&gt;";
  });
}

/** 缩进代码块（无语言信息的 <pre>）→ `<代码块：共xx行>`。围栏代码块已在 stripContainers 处理，到不了这里。 */
const PRE_RE = /<pre\b[^>]*>[\s\S]*?<\/pre>/gi;
function preBlocksToPlaceholders(html: string): string {
  return html.replace(PRE_RE, block => {
    const inner = block.replace(/<[^>]*>/g, "");
    const lines = inner.split("\n");
    if (lines.length > 0 && lines[lines.length - 1]!.trim() === "") lines.pop();
    return lines.length > 0 ? `&lt;代码块：共${lines.length}行&gt;` : "&lt;代码块&gt;";
  });
}

/** HTML 串压成纯文本：表格/代码块/图片→占位 → 块级/换行标签先转成换行避免粘连 → 去所有标签 → 解码实体。 */
function htmlToText(html: string): string {
  const withTables = tablesToPlaceholders(html);
  const withPre = preBlocksToPlaceholders(withTables);
  const withImages = imagesToPlaceholders(withPre);
  const withBreaks = withImages
    .replace(/<\/(p|div|section|article|li|ul|ol|h[1-6]|blockquote|pre|tr|thead|tbody|table)\s*>/gi, "\n")
    .replace(/<br\s*\/?>/gi, "\n");
  const noTags = withBreaks.replace(/<[^>]*>/g, "");
  return decodeEntities(noTags);
}

// CJK 汉字与 ASCII 字母/数字相邻处补空格（中文排版规范；全角标点不算，`网易云，id=` 不再加）。
const CJK_LATIN_1_RE = /([一-鿿])([A-Za-z0-9])/g;
const CJK_LATIN_2_RE = /([A-Za-z0-9])([一-鿿])/g;
export function spaceCjkLatin(s: string): string {
  return s.replace(CJK_LATIN_1_RE, "$1 $2").replace(CJK_LATIN_2_RE, "$1 $2");
}

/** markdown 正文 → 纯文本：`:::` 容器/代码块按规则替换占位，其余 markdown 渲染后去标签。 */
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
  // 中文与英文/数字之间补空格（占位标签如 <代码块：语言 js，共 5 行> 同样生效）
  return spaceCjkLatin(text);
}
