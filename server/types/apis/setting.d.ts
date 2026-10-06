export type SettingKey =
  | "siteName"
  | "siteUrl"
  | "siteDesc"
  | "siteIcp"
  | "homeCustomText"
  | "photoCategorySlug"
  | "commentEnabled"
  | "commentAvatarService"
  | "commentPageSize"
  | "commentMaxLevel"
  | "commentInterval"
  | "commentRequireMail"
  | "commentRequireLink"
  | "contentPageSize"
  | "feedCacheInterval"
  | "linkAutoApprove"
  | "musicPlaylistId"
  | "adminEmail"
  | "notifyAdmin";

export interface SiteSettings {
  siteName: string;
  siteUrl: string;
  siteDesc: string;
  siteIcp: string;
  homeCustomText: string;
  photoCategorySlug: string;
  commentEnabled: boolean;
  commentAvatarService: string;
  commentPageSize: number;
  commentMaxLevel: number;
  commentInterval: number;
  commentRequireMail: boolean;
  commentRequireLink: boolean;
  contentPageSize: number;
  feedCacheInterval: number;
  linkAutoApprove: boolean;
  musicPlaylistId: string;
  /** 站主邮箱（错误监控/订阅等通知收件人） */
  adminEmail: string;
  /** 是否启用邮件通知（false 时不发送） */
  notifyAdmin: boolean;
}

export type MetaItem = {
  key: SettingKey;
  value: string;
};

// 可变的中间状态：值类型是联合体，允许循环里按 key 写入；最后断言为精确 SiteSettings
export type MutableSettings = Record<SettingKey, string | boolean | number>;
