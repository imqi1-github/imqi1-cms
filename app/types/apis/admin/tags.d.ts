// Tag from /api/admin/tags
export interface TagItem {
	mid: number;
	name: string;
	slug: string | null;
	desc: string | null;
	type: string;
	postrelations: any[];
	postCount: number;
}