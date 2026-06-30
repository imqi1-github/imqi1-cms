/** 用户详情（/api/admin/users/:id GET，select 不含 auth_code） */
export interface UserDetail {
	uid: number;
	name: string;
	nickname: string | null;
	avatar: string | null;
	mail: string;
	/** Prisma DateTime，经 Nitro 序列化为 string */
	create_time: string;
}

export interface CurrentUser {
	uid: number;
	name: string;
	nickname: string | null;
	avatar: string | null;
	mail: string;
}