// Explicit type to avoid stack depth issues with InternalApi inference
export interface SubscribeItem {
	id: number;
	url: string;
	name: string;
	avatar: string | null;
	lastUpdated: Date | null;
}

export interface SubscribesUpdateResponse {
	success: boolean;
	data: {
		success: number;
		failed: number;
		total: number;
	};
}