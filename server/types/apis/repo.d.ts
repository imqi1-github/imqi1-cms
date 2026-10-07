/** 仓库卡片信息（服务端代理归一化后的字段，前端 MarkdownRepo 消费） */
export interface RepoInfo {
	platform: "github" | "gitee";
	owner: string;
	repo: string;
	fullName: string;
	description: string;
	language: string;
	stars: number;
	forks: number;
}

export interface RepoResponse {
	success: true;
	data: RepoInfo;
	/** 命中服务端缓存（24h 内） */
	cached?: boolean;
	/** 回源失败，回退到过期缓存兜底（最长 7 天） */
	stale?: boolean;
}
