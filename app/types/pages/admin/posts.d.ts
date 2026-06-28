import type {InternalApi} from "nitropack/types";

export type Category = InternalApi["/api/admin/categories"]["get"][number];
export type Tag = InternalApi["/api/admin/tags"]["get"][number];
export type AdminPost = NonNullable<InternalApi["/api/admin/posts"]["get"]["data"]>[number];
export type PostMeta = NonNullable<InternalApi["/api/admin/post-categories/:id"]["get"]["data"]>[number];
export type Travel = InternalApi["/api/admin/travels"]["get"][number];
export type Attachment = NonNullable<InternalApi["/api/attachments/list"]["get"]["data"]>[number];