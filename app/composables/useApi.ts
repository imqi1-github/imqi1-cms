/**
 * 类型安全的 API 调用 composable
 *
 * 使用示例:
 * ```ts
 * // 1. 基础调用
 * const { data, pending, error } = await useApi("/search", "get", {
 *   query: { q: "关键词" },
 * });
 *
 * // 2. 带类型标注（推荐）
 * import type { ApiTypes } from "~~/shared/api-types.generated";
 *
 * const { data } = await useApi<ApiTypes["/search"]["get"]["response"]>(
 *   "/search",
 *   "get",
 *   { query: { q: "关键词" } }
 * );
 *
 * // 3. 便捷方式
 * const result = await $apiGet<ApiTypes["/search"]["get"]["response"]>(
 *   "/search",
 *   { q: "关键词" }
 * );
 * ```
 */

type HttpMethod = "get" | "post" | "put" | "delete" | "patch";

interface ApiOptionsBase {
  query?: any;
  body?: any;
  fetchOptions?: Record<string, any>;
  immediate?: boolean;
  showErrorToast?: boolean;
  showSuccessToast?: boolean;
  successMessage?: string;
}

/**
 * 类型安全的 API 调用
 *
 * @param path API 路径
 * @param method HTTP 方法
 * @param options 请求选项
 * @template Response 可以手动指定响应类型
 */
export function useApi<Response = any>(
  path: string,
  method: HttpMethod,
  options: ApiOptionsBase = {},
) {
  const {
    query,
    body,
    fetchOptions = {},
    immediate = true,
    showErrorToast = true,
    showSuccessToast = false,
    successMessage,
  } = options;

  const toast = useToast();

  return useFetch<Response>(path, {
    method: method as any,
    query,
    body,
    immediate,
    ...fetchOptions,
    onResponse({ response }) {
      if (showSuccessToast && response.ok) {
        toast.success({ message: successMessage || "操作成功" });
      }
      fetchOptions.onResponse?.({ response });
    },
    onResponseError({ response }) {
      if (showErrorToast) {
        const errorMsg = (response._data as any)?.message || `请求失败: ${response.status}`;
        toast.error({ message: errorMsg });
      }
      fetchOptions.onResponseError?.({ response });
    },
  });
}

/**
 * 类型安全的 GET 请求快捷方式
 *
 * @template Response 可以手动指定响应类型
 */
export function useApiGet<Response = any>(
  path: string,
  query?: any,
  options?: Omit<ApiOptionsBase, "query" | "body">,
) {
  return useApi<Response>(path, "get", {
    query,
    ...options,
  });
}

/**
 * 类型安全的 POST 请求快捷方式
 *
 * @template Response 可以手动指定响应类型
 */
export function useApiPost<Response = any>(
  path: string,
  body?: any,
  options?: Omit<ApiOptionsBase, "query" | "body">,
) {
  return useApi<Response>(path, "post", {
    body,
    ...options,
  });
}

/**
 * 类型安全的一次性 API 调用（类似 $fetch）
 *
 * @template Response 可以手动指定响应类型
 */
export async function $api<Response = any>(
  path: string,
  method: HttpMethod,
  options: Omit<ApiOptionsBase, "immediate"> = {},
): Promise<Response> {
  const { query, body, fetchOptions = {} } = options;

  try {
    return await $fetch(path, {
      method: method as any,
      query,
      body,
      ...fetchOptions,
    }) as unknown as Response;
  } catch (error: any) {
    // 标记为已处理，避免全局错误处理器重复提示
    if (error) {
      error.__handled__ = true;
    }
    throw error;
  }
}

/**
 * 便捷的 $apiGet
 *
 * @template Response 可以手动指定响应类型
 */
export async function $apiGet<Response = any>(
  path: string,
  query?: any,
  fetchOptions?: Record<string, any>,
): Promise<Response> {
  return $api<Response>(path, "get", {
    query,
    fetchOptions,
  });
}

/**
 * 便捷的 $apiPost
 *
 * @template Response 可以手动指定响应类型
 */
export async function $apiPost<Response = any>(
  path: string,
  body?: any,
  fetchOptions?: Record<string, any>,
): Promise<Response> {
  return $api<Response>(path, "post", {
    body,
    fetchOptions,
  });
}
