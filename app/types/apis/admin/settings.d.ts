/**
 * 管理端站点设置（/api/admin/settings GET 返回、POST 提交体）。
 *
 * 后端以 Record<string, string|number|boolean> 收发，此处给出前端表单的精确结构，
 * 供 settings ref 与 $fetch 显式泛型使用，避免对 InternalApi 全表做 MatchedRoutes 深递归。
 */
export interface AdminSettings {
	siteName: string;
	siteUrl: string;
	siteDesc: string;
	siteIcp: string;
	commentEnabled: boolean;
	commentModeration: boolean;
	commentAvatarService: string;
	commentPageSize: number;
	commentMaxLevel: number;
	commentRequireMail: boolean;
	commentRequireLink: boolean;
	commentInterval: number;
	contentPageSize: number;
	feedCacheInterval: number;
	homeCustomText: string;
	musicPlaylistId: string;
	photoCategorySlug: string;
	moderationApiType: string;
	baiduAppId: string;
	baiduApiKey: string;
	baiduSecretKey: string;
	baiduCheckAdmin: boolean;
	emailLogEnabled: boolean;
	emailPushType: string;
	smtpHost: string;
	smtpUser: string;
	smtpAddress: string;
	smtpPassword: string;
	smtpSecureMode: string;
	smtpPort: number;
	smtpFromName: string;
	adminEmail: string;
	notifyAdmin: boolean;
	uploadLocation: "local" | "cos";
	cosSecretId: string;
	cosSecretKey: string;
	cosBucket: string;
	cosRegion: string;
	cosSourceDomain: string;
	cosCdnDomain: string;
	cosImageSuffix: string;
	sessionStoreType: string;
	messageContentId: string;
	linkAutoApprove: boolean;
	searchCacheEnabled: boolean;
	searchCacheExpire: number;
}
