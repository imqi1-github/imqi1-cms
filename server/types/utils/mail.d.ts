/** 邮件发送选项 */
export interface MailOptions {
  to: string;
  subject: string;
  text?: string;
  html?: string;
}
