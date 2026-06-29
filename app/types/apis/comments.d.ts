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

/** 提交评论请求体 */
export interface CommentSubmitBody {
	csrfToken: string;
	cid: number;
	content: string;
	name: string;
	mail: string;
	link: string;
	parent_id: number | null;
	website: string; // 蜜罐字段
	captcha?: string; // 图形验证码
}

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