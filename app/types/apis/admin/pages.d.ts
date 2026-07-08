// Page from /api/admin/pages
export interface User {
	uid: number;
	name: string;
	nickname: string | null;
}

export interface ContentRelation {
	cid: number;
	mid: number;
	metas: {
		mid: number;
		name: string;
		slug: string | null;
	};
}

export interface PageItem {
	cid: number;
	title: string;
	slug: string | null;
	desc: string | null;
	content: string | null;
	create_time: string;
	update_time: string;
	status: number;
	comment_num: number;
	many_covers: boolean;
	covers: string | null;
	show_toc: boolean;
	tags: string | null;
	type: number;
	uid: number;
	user: User;
	relations: ContentRelation[];
}

/** 页面列表分页信息（/api/admin/pages） */
export interface PagePagination {
	page: number;
	pageSize: number;
	total: number;
	totalPages: number;
	hasMore: boolean;
}

/** 页面列表接口响应（/api/admin/pages） */
export interface PageListResponse {
	data: PageItem[];
	pagination: PagePagination;
}

/** 页面/文章详情（/api/admin/contents/:cid GET 返回的 data，原始 contents 字段 + user） */
export interface ContentDetail {
	cid: number;
	title: string;
	slug: string | null;
	desc: string | null;
	content: string | null;
	create_time: string;
	update_time: string;
	status: number;
	comment_num: number;
	many_covers: boolean;
	covers: string | null;
	show_toc: boolean;
	tags: string | null;
	type: number;
	uid: number;
	user: {
		uid: number;
		name: string;
		avatar: string | null;
	};
}

/** 页面/文章详情接口响应 */
export interface ContentDetailResponse {
	success: boolean;
	data: ContentDetail;
}