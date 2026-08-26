import type { AdminContent, AdminContentListResponse } from "~/types/apis/admin/contents";
import type { PageItem, PageListResponse } from "~/types/apis/admin/pages";

// 后台「关联下拉」选目标用：/api/admin/contents 与 /api/admin/pages 都把 pageSize 封顶在 100，
// 前端单次 pageSize=999 会被截断为 100，内容超过 100 条时下拉静默拉不全。故手动分页聚合全量。
const PAGE_SIZE = 100;

/** 分页拉取全部文章（关联下拉用）。pageSize 封顶 100，逐页取至 totalPages。 */
export async function fetchAllAdminContents(): Promise<AdminContent[]> {
  const first = await $fetch<AdminContentListResponse>(`/api/admin/contents?page=1&pageSize=${PAGE_SIZE}`);
  const items: AdminContent[] = first.data || [];
  const totalPages = first.pagination?.totalPages || 1;
  for (let p = 2; p <= totalPages; p++) {
    const res = await $fetch<AdminContentListResponse>(`/api/admin/contents?page=${p}&pageSize=${PAGE_SIZE}`);
    items.push(...(res.data || []));
  }
  return items;
}

/** 分页拉取全部页面（关联下拉用）。pageSize 封顶 100，逐页取至 totalPages。 */
export async function fetchAllAdminPages(): Promise<PageItem[]> {
  const first = await $fetch<PageListResponse>(`/api/admin/pages?page=1&pageSize=${PAGE_SIZE}`);
  const items: PageItem[] = first.data || [];
  const totalPages = first.pagination?.totalPages || 1;
  for (let p = 2; p <= totalPages; p++) {
    const res = await $fetch<PageListResponse>(`/api/admin/pages?page=${p}&pageSize=${PAGE_SIZE}`);
    items.push(...(res.data || []));
  }
  return items;
}
