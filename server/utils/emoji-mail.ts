// 邮件评论表情渲染：把 :[heo-3d眼镜] 占位符替换为 CID 内嵌附件的 <img>，
// 供 server/utils/mail.ts 的 HTML 邮件使用。
//
// 为什么用 CID 而非远程 URL / data:URI：
// - 远程 URL：Gmail/QQ邮箱等默认不自动加载远程图，收件人看到的是 alt 文字，需手动点「加载图片」；
// - data:URI：被 Gmail/Outlook 等剥离（安全策略），几乎不可用；
// - CID 内嵌附件（本方案）：图片随邮件发出、<img src="cid:xxx">，所有主流客户端打开即显示。
//
// 单一事实源：分类配置与 stripEmojiPrefix 复用 ~~shared/emoji-categories（前端 emoji.ts 同源）；
// emojis.json 在 Nitro server bundle 之外，运行时 fs 读取（dev 从 app/assets，生产从 runtime-assets——
// 见 nuxt.config.ts 的 nitro compiled hook 复制）。

import { existsSync, readFileSync } from "node:fs";
import * as path from "node:path";
import { fileURLToPath } from "node:url";

import { escapeAttribute, escapeHtml } from "~~/lib/html";
import { EMOJI_CATEGORIES, stripEmojiPrefix } from "~~/shared/emoji-categories";
import { getPublicDir } from "#server/utils/attachment-file";

export interface MailEmojiAttachment {
  /** Content-ID，ASCII，形如 emoji-0@imqi1（RFC 2392 message-id 形式，兼容性好）。 */
  cid: string;
  /** PNG 绝对路径（含中文文件名，fs / nodemailer 读取不挑）。 */
  path: string;
  /** ASCII 文件名（emoji-0.png），避免中文 filename 触发 MIME 头编码后 Outlook 解析不稳。 */
  filename: string;
  contentType: string;
}

interface EmojiEntry {
  path: string;
  name: string;
}

// 表情 key -> {png 绝对路径, 显示名}，首次使用时从 emojis.json 构建（进程缓存，publicDir 启动后稳定）。
let emojiKeyMap: Map<string, EmojiEntry> | null = null;

// 定位 emojis.json：生产优先 server/runtime-assets（nitro compiled hook 复制），dev 回退 app/assets。
function resolveEmojisJsonPath(): string {
  const candidates = [
    path.join(process.cwd(), "server", "runtime-assets", "emojis.json"),
    path.join(process.cwd(), "app", "assets", "emojis.json"),
  ];
  // 生产（.output 部署）下 cwd 可能是仓库根或 .output；从本模块 URL 向上找 runtime-assets / app/assets 兜底。
  try {
    let dir = path.dirname(fileURLToPath(import.meta.url));
    for (let i = 0; i < 8; i++) {
      candidates.push(path.join(dir, "runtime-assets", "emojis.json"));
      candidates.push(path.join(dir, "app", "assets", "emojis.json"));
      const parent = path.dirname(dir);
      if (parent === dir) break;
      dir = parent;
    }
  } catch {
    // 顶层占位模块无 fileURL，忽略
  }
  for (const c of candidates) {
    try {
      if (existsSync(c)) return c;
    } catch {
      /* 继续尝试下一个候选 */
    }
  }
  return candidates[0]!;
}

function getEmojiKeyMap(): Map<string, EmojiEntry> {
  if (emojiKeyMap) return emojiKeyMap;
  const data = JSON.parse(readFileSync(resolveEmojisJsonPath(), "utf-8")) as Record<string, Record<string, string>>;
  const map = new Map<string, EmojiEntry>();
  const publicDir = getPublicDir();
  for (const cat of EMOJI_CATEGORIES) {
    const dict = data[cat.dataKey];
    if (!dict) continue;
    for (const [key, relPath] of Object.entries(dict)) {
      map.set(key, {
        path: path.join(publicDir, relPath),
        name: stripEmojiPrefix(key, cat.prefix),
      });
    }
  }
  emojiKeyMap = map;
  return map;
}

const PLACEHOLDER_RE = /:\[([^\]]+)\]/g;

/**
 * 累积式邮件表情渲染器：一封邮件 new 一个实例，多次 renderContent 共享 cid 编号与附件表，
 * 保证同一表情（即便跨多条评论）只附加一份、cid 不冲突。
 *
 * 典型用法（notifyCommentReply 同时渲染「原评论」+「新回复」）：
 *   const renderer = new MailEmojiRenderer();
 *   const parent = renderer.renderContent(parentCommentContent);
 *   const reply  = renderer.renderContent(replyContent);
 *   sendMail({ ..., attachments: renderer.getAttachments() });
 */
export class MailEmojiRenderer {
  private used = new Map<string, string>(); // emojiKey -> cid（去重）
  private counter = 0;
  private attachments: MailEmojiAttachment[] = [];

  /** 渲染一段评论文本：先 escapeHtml（顺带修邮件未转义插值的 XSS），再把 :[key] 替换为 cid img。未命中保留原占位符。 */
  renderContent(text: string | null | undefined): string {
    if (!text) return "";
    const escaped = escapeHtml(text);
    if (!text.includes(":[")) return escaped;
    const map = getEmojiKeyMap();
    return escaped.replace(PLACEHOLDER_RE, (match, key: string) => {
      const found = map.get(key);
      if (!found) return match;
      let cid = this.used.get(key);
      if (!cid) {
        cid = `emoji-${this.counter++}`;
        this.used.set(key, cid);
        this.attachments.push({
          cid: `${cid}@imqi1`,
          path: found.path,
          filename: `${cid}.png`,
          contentType: "image/png",
        });
      }
      // 邮件客户端对 em/CSS 支持差，用固定 px inline style 最稳。
      return `<img src="cid:${cid}@imqi1" alt="${escapeAttribute(found.name)}" style="display:inline-block;vertical-align:middle;width:22px;height:22px;margin:0 1px;" />`;
    });
  }

  /** 取本邮件用到的全部表情附件（已按 key 去重）。无表情时返回空数组。 */
  getAttachments(): MailEmojiAttachment[] {
    return this.attachments;
  }
}
