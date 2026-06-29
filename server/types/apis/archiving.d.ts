/** 归档列表中的单篇文章 */
export interface ArchivePost {
	cid: number;
	title: string;
	slug: string | null;
	categorySlug: string | null;
	createTime: Date;
}

/** 按年月分组的归档组 */
export interface ArchiveGroup {
	year: number;
	month: number;
	posts: ArchivePost[];
}
