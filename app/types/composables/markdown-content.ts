import type { MarkdownImageDimensions } from "~/types/pages/content-detail";

/**
 * useMarkdownContent 的入参。
 *
 * @param findImageDimensions 图片尺寸解析：文章页用 markdown 附件宽度（见 [slug].vue 的 findMarkdownImageDimensions），
 *  独立页面（协议页等）无附件数据，可返回 `() => ({ width: null, height: null })`。
 */
export interface MarkdownContentOptions {
  findImageDimensions: (url: string) => MarkdownImageDimensions;
}
