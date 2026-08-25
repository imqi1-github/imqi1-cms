export interface LinkItem {
	id: number;
	name: string;
	desc: string | null;
	link: string;
	avatar: string | null;
}

/** 友链可达性检测状态 */
export type LinkCheckStatus = "up" | "down" | "checking";

/** 单个友链的检测结果 */
export interface LinkStatus {
	status: LinkCheckStatus;
	checkedAt: number;
}

/** 友链表单模式：apply=申请, edit=修改 */
export type LinkFormMode = "apply" | "edit";