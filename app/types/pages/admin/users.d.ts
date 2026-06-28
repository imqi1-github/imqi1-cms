import type {InternalApi} from "nitropack/types";

export type UserItem = InternalApi["/api/admin/users"]["get"][number];
export type CurrentUser = InternalApi["/api/auth/me"]["get"];
export type ApiError = { statusCode?: number; message?: string; data?: { message?: string } };
export type UserDetail = InternalApi["/api/admin/users/:id"]["get"]