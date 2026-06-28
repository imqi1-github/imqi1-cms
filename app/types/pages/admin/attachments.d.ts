import type {InternalApi} from "nitropack/types";

export type AttachmentDetail = NonNullable<InternalApi["/api/admin/attachments/:id"]["get"]["data"]>
export type ApiError = { statusCode?: number; message?: string; data?: { message?: string } }
export type AttachmentItem = NonNullable<NonNullable<InternalApi["/api/admin/attachments/all"]["get"]["data"]>["list"]>[number];