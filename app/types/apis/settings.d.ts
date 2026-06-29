export type SettingKey =
  | "siteName"
  | "siteUrl"
  | "siteDesc"
  | "siteIcp"
  | "homeCustomText"
  | "photoCategorySlug"
  | "commentEnabled"
  | "commentModeration"
  | "commentAvatarService"
  | "commentPageSize"
  | "commentMaxLevel"
  | "commentInterval"
  | "commentRequireMail"
  | "commentRequireLink"
  | "postPageSize"
  | "feedCacheInterval"
  | "linkAutoApprove"
  | "musicPlaylistId"
  | "searchCacheEnabled"
  | "searchCacheExpire";

export interface SiteSettings {
  siteName: string;
  siteUrl: string;
  siteDesc: string;
  siteIcp: string;
  homeCustomText: string;
  photoCategorySlug: string;
  commentEnabled: boolean;
  commentModeration: boolean;
  commentAvatarService: string;
  commentPageSize: number;
  commentMaxLevel: number;
  commentInterval: number;
  commentRequireMail: boolean;
  commentRequireLink: boolean;
  postPageSize: number;
  feedCacheInterval: number;
  linkAutoApprove: boolean;
  musicPlaylistId: string;
  searchCacheEnabled: boolean;
  searchCacheExpire: number;
}