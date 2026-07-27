import type { MailEmojiAttachment } from "#server/utils/emoji-mail";

/** 邮件发送选项 */
export interface MailOptions {
  to: string;
  subject: string;
  text?: string;
  html?: string;
  /** 邮件内嵌表情等 CID 附件（由 MailEmojiRenderer 收集），无则不发。 */
  attachments?: MailEmojiAttachment[];
}
