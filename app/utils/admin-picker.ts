import type { AdminContent, AdminContentListResponse } from "~/types/apis/admin/contents";
import type { PageItem, PageListResponse } from "~/types/apis/admin/pages";

// 后台「关联下拉」选目标用：这里要的是全量而非某一页，一次拉到上限响应过重，故按 100/页逐页聚合
// （pageSize 上下限见 shared/constants.ts）。
const PAGE_SIZE = 100;

/** 分页拉取全部文章（关联下拉用）。逐页取至 totalPages。 */
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

/** 分页拉取全部页面（关联下拉用）。逐页取至 totalPages。 */
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
