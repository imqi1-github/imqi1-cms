import type {InternalApi} from "nitropack/types";

export type RecentPost = InternalApi["/api/admin/recent-posts"]["get"][number];
export type RecentComment = InternalApi["/api/admin/recent-comments"]["get"][number];
export type PopularPost = InternalApi["/api/admin/popular-posts"]["get"][number];