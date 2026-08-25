// 搜索 API 类型

/** 搜索类别：文章 / 订阅和友链 / 评论 / 订阅文章 */
export type SearchType = "content" | "subscribe" | "comment" | "subscribepost";

/** 搜索类别 Tab 配置：value 驱动查询，label/icon 驱动展示 */
export interface SearchTypeConfig {
  value: SearchType;
  label: string;
  icon: string;
}

/** 文章搜索结果项 */
export interface ContentSearchItem {
	type: "content";
	cid: number;
	title: string;
	slug: string | null;
	desc: string | null;
	createTime: string;
	categoryName: string | null;
	categorySlug: string | null;
	/** 正文高亮摘要（后端已拼 <mark>） */
	highlight?: string;
}

/** 订阅源 / 友链搜索结果项（kind 区分来源） */
export interface SubscribeSearchItem {
	type: "subscribe";
	kind: "subscribe" | "link";
	id: number;
	name: string;
	url: string;
	desc: string | null;
	avatar: string | null;
}

/** 评论搜索结果项（白名单字段，附文章上下文） */
export interface CommentSearchItem {
	type: "comment";
	coid: number;
	name: string;
	content: string;
	avatar: string;
	createTime: string;
	articleTitle: string | null;
	articleUrl: string | null;
}

/** 订阅文章搜索结果项（RSS 订阅抓取的文章） */
export interface SubscribePostSearchItem {
	type: "subscribepost";
	id: number;
	subscribeId: number;
	subscribeName: string;
	subscribeAvatar: string | null;
	title: string;
	link: string;
	description: string | null;
	author: string | null;
	pubDate: string | null;
}

export type SearchResultItem =
	| ContentSearchItem
	| SubscribeSearchItem
	| CommentSearchItem
	| SubscribePostSearchItem;

export interface SearchApiResponse {
	code: number;
	message: string;
	data: {
		results: SearchResultItem[];
		total: number;
		query: string;
		type: SearchType;
	};
}
