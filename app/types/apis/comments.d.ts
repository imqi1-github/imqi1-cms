// Comments API response
import type {Comment} from "~/types/components/comment";

export interface CommentNode {
	coid: number;
	cid: number;
	name: string;
	mail: string | null;
	link: string | null;
	content: string;
	create_time: string;
	status: number;
	parent_id: number | null;
	agent: string | null;
	ip: string | null;
	children: CommentNode[];
	parent_name: string | null;
	location: string;
	isp: string;
}

export interface CommentsApiResponse {
	code: number;
	message: string;
	data: CommentNode[];
	pagination: {
		page: number;
		pageSize: number;
		total: number;
		totalAllComments: number;
		totalPages: number;
		hasMore: boolean;
	};
}

/** 评论提交 API 响应 */
export interface CommentSubmitResponse {
	code: number;
	message: string;
	data: Comment | null;
	needModeration: boolean;
	auditResult: unknown | null;
}

/** 评论列表项（后台管理用） */
export interface CommentItem {
	coid: number;
	cid: number;
	name: string;
	mail: string | null;
	link: string | null;
	content: string;
	create_time: string;
	status: number;
	parent_id: number | null;
	agent: string | null;
	ip: string | null;
	avatarUrl: string | null;
	location: string;
	isp: string;
	posts: {
		cid: number;
		title: string;
		slug: string | null;
		postrelations: Array<{
			metas: {
				slug: string | null;
			};
		}>;
	};
}