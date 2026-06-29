/**
 * 页面 SEO 元数据辅助 composable
 *
 * 统一生成 description / keywords / og:* / twitter:* 元标签，
 * 避免每个页面重复编写相同的 useHead meta 数组。
 *
 * @example
 * ```ts
 * // 仅标题
 * usePageSeo({ title: computed(() => `友情链接 - ${siteName.value}`) });
 *
 * // 完整 SEO
 * usePageSeo({
 *   title: computed(() => `关于 - ${siteName.value}`),
 *   description: "了解本站博主……",
 *   keywords: "关于,个人介绍",
 * });
 * ```
 */
import type {PageSeoOptions} from "~/types/composables/seo";

export function usePageSeo(options: PageSeoOptions): void {
  const { title, description, keywords, ogType = "website" } = options;

  // 使用函数形式确保 ComputedRef 在 meta 数组中也能响应式更新
  useHead(() => {
    const t = unref(title);
    const d = description ? unref(description) : undefined;
    const k = keywords ? unref(keywords) : undefined;

    return {
      title: t,
      meta: [
        ...(d ? [{ name: "description", content: d }] : []),
        ...(k ? [{ name: "keywords", content: k }] : []),
        { property: "og:title", content: t },
        ...(d ? [{ property: "og:description", content: d }] : []),
        { property: "og:type", content: ogType },
        { name: "twitter:title", content: t },
        ...(d ? [{ name: "twitter:description", content: d }] : []),
      ],
    };
  });
}
