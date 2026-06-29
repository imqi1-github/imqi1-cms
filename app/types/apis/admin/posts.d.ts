import type { TagItem } from "./tags";

export interface Category {
	mid: number;
	name: string;
	slug: string | null;
	postCount: number;
}

export type Tag = TagItem;

export interface PostUser {
	uid: number;
	name: string;
	avatar: string | null;
}

export interface PostMetaRelation {
	cid: number;
	mid: number;
	metas: {
		mid: number;
		name: string;
		slug: string | null;
		type: string;
	};
}

export interface AdminPost {
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
	user: PostUser;
	postrelations: PostMetaRelation[];
}

export interface PostMeta {
	mid: number;
	name: string;
	slug: string | null;
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
	posts: { cid: number; title: string }[];
	/** 关联文章 cid 列表（posts.map(p => p.cid)） */
	cids: number[];
}

export interface Attachment {
	id: number;
	name: string;
	type: string;
	url: string;
	size: string;
}

export interface PostResponse {
	success: boolean;
	data: AdminPost;
}

// Union type for both create and update responses
export type PostApiResponse = PostResponse;