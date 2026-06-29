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
  | "postPageSize"
  | "feedCacheInterval"
  | "linkAutoApprove"
  | "musicPlaylistId";

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
  postPageSize: number;
  feedCacheInterval: number;
  linkAutoApprove: boolean;
  musicPlaylistId: string;
}