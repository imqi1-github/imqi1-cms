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
	content: string;
	create_time: string;
	status: number;
	parent_id: number | null;
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

export type { SystemInfo } from "./system-info";