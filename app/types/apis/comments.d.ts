// Comments API response

import type { ParsedAgent } from "#shared/parseUserAgent";

/** parseUserAgent 返回结构（服务端已预解析下发）；与 shared 单一真相源一致，避免两处分叉 */
export type CommentDevice = ParsedAgent;

export interface CommentNode {
	coid: number;
	cid: number;
	name: string;
	link: string | null;
	content: string;
	create_time: string;
	status: number;
	parent_id: number | null;
	avatar: string;
	device: CommentDevice;
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
	data: { coid: number } | null;
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
	contents: {
		cid: number;
		title: string;
		slug: string | null;
		contentrelations: Array<{
			metas: {
				slug: string | null;
			};
		}>;
	};
}