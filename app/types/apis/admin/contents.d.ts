import type { TagItem } from "./tags";

export interface Category {
	mid: number;
	name: string;
	slug: string | null;
	contentCount: number;
}

export type Tag = TagItem;

export interface ContentUser {
	uid: number;
	name: string;
	avatar: string | null;
}

export interface ContentMetaRelation {
	cid: number;
	mid: number;
	metas: {
		mid: number;
		name: string;
		slug: string | null;
		type: string;
	};
}

export interface AdminContent {
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
	user: ContentUser;
	contentrelations: ContentMetaRelation[];
}

export interface ContentMeta {
	mid: number;
	name: string;
	slug: string | null;
}

/** 封面条目：covers JSON 序列化的元素（url 为主地址；cover 兼容旧字段） */
export interface CoversInput {
	url?: string;
	cover?: string;
	title?: string;
}

export interface Travel {
	id: number;
	name: string;
	desc: string | null;
	cover: string | null;
	longitude: number;
	latitude: number;
	sort: number;
	enabled: boolean;
	/** Prisma DateTime，经 Nitro 序列化为 string */
	create_time: string;
	/** 关联文章（{cid,title}[]，/api/admin/travels 展平返回） */
	contents: { cid: number; title: string }[];
	/** 关联文章 cid 列表（contents.map(p => p.cid)） */
	cids: number[];
}

export interface Attachment {
	id: number;
	name: string;
	type: string;
	url: string;
	/** 文件字节数；历史记录可能为 0，前端显示为 "-" */
	size: number;
	width?: number | null;
	height?: number | null;
	format?: string | null;
}

export interface ContentListPagination {
	page: number;
	pageSize: number;
	total: number;
	totalPages: number;
}

export interface AdminContentListResponse {
	data: AdminContent[];
	pagination: ContentListPagination;
}

export interface ContentResponse {
	success: boolean;
	data: AdminContent;
}

// Union type for both create and update responses
export type ContentApiResponse = ContentResponse;

/** 创建/更新文章接口返回：前端保存后只需 cid（不再回传正文等全字段） */
export interface ContentSaveResponse {
	success: boolean;
	data: { cid: number };
}