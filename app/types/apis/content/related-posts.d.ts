// Related Posts from /api/related-posts/:cid
export interface Meta {
	name: string;
	slug: string | null;
}

export interface RelatedPost {
	cid: number;
	title: string;
	slug: string | null;
	desc: string | null;
	covers: Array<{ url: string; title: string }>;
	created: Date;
	commentsNum: number;
	categories: Meta[];
	tags: Meta[];
}