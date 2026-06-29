/** 用户列表项（/api/admin/users GET，findMany 全字段，含 auth_code） */
export interface UserItem {
	uid: number;
	name: string;
	nickname: string | null;
	avatar: string | null;
	mail: string;
	/** Prisma DateTime，经 Nitro 序列化为 string */
	create: string;
	auth_code: string | null;
	role: number;
}

/** 用户详情（/api/admin/users/:id GET，select 不含 auth_code） */
export interface UserDetail {
	uid: number;
	name: string;
	nickname: string | null;
	avatar: string | null;
	mail: string;
	/** Prisma DateTime，经 Nitro 序列化为 string */
	create: string;
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