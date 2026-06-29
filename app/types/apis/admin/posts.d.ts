import type { ApiError } from "~/types/error";
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
	nickname: string | null;
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
	create_time: Date;
	update_time: Date;
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
	create_time: Date;
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