/** 公共附件项（/api/attachments/list、/api/attachments/upload 返回的 data 元素） */
export interface PublicAttachment {
	id: number;
	name: string;
	type: string;
	url: string;
	/** 文件字节数；历史记录可能为 0，前端显示为 "-" */
	size: number;
	/** Prisma DateTime，经 Nitro 序列化为 string */
	create_time: string;
	/** 上传接口额外返回，list 接口无此字段 */
	storage?: string;
}

/** 公共附件列表接口响应（/api/attachments/list） */
export interface PublicAttachmentListResponse {
	success: boolean;
	data: PublicAttachment[];
}

/** 公共附件上传接口响应（/api/attachments/upload） */
export interface PublicAttachmentUploadResponse {
	success: boolean;
	data: PublicAttachment;
}
