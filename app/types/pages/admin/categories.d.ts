import type {InternalApi} from "nitropack/types";

export const toast = useToast();
export type CategoryItem = InternalApi["/api/admin/categories"]["get"][number];
export type ApiError = { statusCode?: number; message?: string; data?: { message?: string } };