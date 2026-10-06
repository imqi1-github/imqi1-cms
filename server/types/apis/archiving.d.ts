/** 归档列表中的单篇文章 */
export interface ArchiveContent {
	cid: number;
	title: string;
	slug: string | null;
	categorySlug: string | null;
	/** 点赞数（关系计数，随归档查询带出） */
	like_num: number;
	/** 发布时间。服务端从 Prisma 的 create_time(Date) 读出，经 Nitro JSON 序列化后为 ISO 字符串，故按响应契约声明为 string */
	createTime: string;
}

/** 按年月分组的归档组 */
export interface ArchiveGroup {
	year: number;
	month: number;
	contents: ArchiveContent[];
}
