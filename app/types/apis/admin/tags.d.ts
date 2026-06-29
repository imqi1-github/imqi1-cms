// 标签与文章关联关系
export interface TagPostRelation {
	cid: number;
	mid: number;
	weight: number;
}

// Tag from /api/admin/tags
export interface TagItem {
	mid: number;
	name: string;
	slug: string | null;
	desc: string | null;
	type: string;
	postrelations: TagPostRelation[];
	postCount: number;
}