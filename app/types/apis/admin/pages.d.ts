// Page from /api/admin/pages
export interface User {
	uid: number;
	name: string;
	nickname: string | null;
}

export interface PostRelation {
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
	user: User;
	relations: PostRelation[];
}