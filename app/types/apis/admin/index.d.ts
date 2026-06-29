export interface RecentPost {
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
}

export interface RecentComment {
	coid: number;
	cid: number;
	name: string;
	mail: string | null;
	link: string | null;
	content: string;
	create_time: string;
	status: number;
	parent_id: number | null;
	agent: string | null;
	ip: string | null;
	posts: {
		title: string;
		cid: number;
	};
}

export interface PopularPost {
	cid: number;
	title: string;
	views: number;
	commentsCount: number;
	create_time: string;
}