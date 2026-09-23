import { clampAdminPageSize } from "#shared/constants";

/** 偏好存储键：后台各列表共用一个，改一处处处一致 */
const STORAGE_KEY = "admin:pageSize";

/** 只在客户端能取到 localStorage，隐私模式下读写都会抛 */
function readStored(fallback: number): number | null {
  if (!import.meta.client) return null;
  try {
    const stored = localStorage.getItem(STORAGE_KEY);
    return stored === null ? null : clampAdminPageSize(stored, fallback);
  } catch {
    // 存储被禁用，按没存过处理
    return null;
  }
}

/**
 * 后台列表每页条数偏好（10/20/50/自定义），存 localStorage 跨页面、跨刷新沿用。
 *
 * 恢复值只在客户端读得到；各列表又都在 onMounted 之后才发请求、分页条也要等首帧响应才渲染，
 * 因此不会把 localStorage 的值渲染进 SSR 输出（无水合不一致）。
 */
export const useAdminPageSize = (fallback = 10) => {
  const pageSize = ref(clampAdminPageSize(fallback, fallback));

  const stored = readStored(fallback);
  if (stored !== null) pageSize.value = stored;

  watch(pageSize, (value) => {
    if (!import.meta.client) return;
    try {
      localStorage.setItem(STORAGE_KEY, String(value));
    } catch {
      // 存储被禁用/写满：只是记不住偏好，不影响本次分页
    }
  });

  return { pageSize };
};
