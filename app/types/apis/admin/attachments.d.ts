/** 附件列表项关联文章 */
export interface AttachmentItemPost {
	cid: number;
	title: string;
}

/** 附件列表项（/api/admin/attachments/all 返回的 list 元素） */
export interface AttachmentItem {
	id: number;
	name: string;
	type: string;
	url: string;
	/** 文件大小，列表接口暂不支持，返回 "-" */
	size: string;
	/** Prisma Date 经序列化为 string */
	createTime: string;
	post: AttachmentItemPost | null;
}

/** 附件关联文章 */
export interface AttachmentDetailPost {
	cid: number;
	title: string;
	slug: string | null;
}

/** 附件详情（/api/admin/attachments/:id GET 返回的 data） */
export interface AttachmentDetail {
	id: number;
	name: string;
	type: string;
	url: string;
	size: number;
	width: number | null;
	height: number | null;
	format: string | null;
	createdAt: string;
	post: AttachmentDetailPost | null;
}

/** 附件详情接口响应 */
export interface AttachmentDetailResponse {
	success: boolean;
	data: AttachmentDetail;
}

/** 附件更新接口响应 */
export interface AttachmentUpdateResponse {
	success: boolean;
	data: {
		id: number;
		name: string;
	};
}

/** 附件列表接口响应 */
export interface AttachmentListResponse {
	success: boolean;
	data: {
		list: AttachmentItem[];
		total: number;
		page: number;
		pageSize: number;
	};
}
