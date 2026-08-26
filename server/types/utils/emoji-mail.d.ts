/** 邮件表情 CID 附件：由 MailEmojiRenderer 收集、随邮件发送的单个内嵌图。 */
export interface MailEmojiAttachment {
  /** Content-ID，ASCII，形如 emoji-0@imqi1（RFC 2392 message-id 形式，兼容性好）。 */
  cid: string;
  /** PNG 绝对路径（含中文文件名，fs / nodemailer 读取不挑）。 */
  path: string;
  /** ASCII 文件名（emoji-0.png），避免中文 filename 触发 MIME 头编码后 Outlook 解析不稳。 */
  filename: string;
  contentType: string;
}

/** 单个表情项：png 绝对路径 + 显示名（来自 emojis.json，供注册进 emojiKeyMap）。 */
export interface EmojiEntry {
  path: string;
  name: string;
}
