import type { ApiError } from "~/types/error";

export interface UserItem {
	uid: number;
	name: string;
	nickname: string | null;
	avatar: string | null;
	mail: string;
	create: Date;
	auth_code: string | null;
	role: number;
}

export interface CurrentUser {
	uid: number;
	name: string;
	nickname: string | null;
	avatar: string | null;
	mail: string;
	role: number;
}

export interface UserDetail extends UserItem {
	// 可以添加更多用户详细信息字段
}