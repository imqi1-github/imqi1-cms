export interface RecentContent {
	cid: number;
	title: string;
	create_time: string;
	status: number;
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
	contents: {
		title: string;
		cid: number;
	};
}

export interface PopularContent {
	cid: number;
	title: string;
	commentsCount: number;
	create_time: string;
}