import type {CommentItem as AdminCommentItem} from "~/types/apis/comments";

export { CommentItem as AdminCommentItem };
export type CommentItem = AdminCommentItem;

export interface CommentsPagination {
  page: number;
  pageSize: number;
  total: number;
  totalPages: number;
}

export interface CommentListResponse {
  data: CommentItem[];
  pagination: CommentsPagination;
}