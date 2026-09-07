// Explicit type to avoid stack depth issues with InternalApi inference
export interface SubscribeItem {
	id: number;
	url: string;
	name: string;
	avatar: string | null;
	lastUpdated: string | null; // Prisma DateTime，经 Nitro 序列化为 string | null
	lastUpdateStatus: SubscribeUpdateStatus | null; // 最近一次更新的状态（内存，重启归零）
}

// 订阅源最近一次更新的状态：成功带文章数+最新文章标题，失败带错误信息
export interface SubscribeUpdateStatus {
	success: boolean;
	message: string;
	articleCount: number;
	latestTitle: string | null;
	updatedAt: number;
}

export interface SubscribesUpdateResponse {
	success: boolean;
	data: {
		started: boolean;
	};
}

// 订阅更新会话内存统计（重启归零，不持久化）；成功/失败为最近一次更新，updateCount 为累计次数
export interface SubscriptionStats {
	updateCount: number;
	lastRunAt: number | null;
	successCount: number;
	failureCount: number;
}