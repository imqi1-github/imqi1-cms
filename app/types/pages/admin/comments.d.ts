import type {InternalApi} from "nitropack/types";

type CommentsResponse = InternalApi["/api/admin/comments"]["get"];
export type CommentItem = NonNullable<CommentsResponse["data"][number]>;