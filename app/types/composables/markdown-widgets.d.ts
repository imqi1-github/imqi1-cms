// markdown widget 挂载引擎（useMarkdownWidgets）的共享类型。
// 规则4：类型独立文件，不在 composable 内联（原在 useMarkdownWidgets.ts 内联，挪到此）。
export type MarkdownImageDimensions = { width: number | null; height: number | null };
export type MarkdownSlide = { url: string; title: string; width: number | null; height: number | null };
export type MarkdownWaterfallImage = { url: string; caption: string; width: number | null; height: number | null };

export interface UseMarkdownWidgetsOptions {
  /** 由页面提供：基于文章附件元数据解析图片尺寸（markdownImageAttachments）。 */
  findImageDimensions: (url: string) => MarkdownImageDimensions;
}
