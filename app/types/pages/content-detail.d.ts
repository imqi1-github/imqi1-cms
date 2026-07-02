export interface MarkdownImageDimensions {
  width: number | null;
  height: number | null;
}

export interface MarkdownAttachmentImage extends MarkdownImageDimensions {
  url: string;
}

export interface MarkdownWaterfallImage extends MarkdownImageDimensions {
  url: string;
  caption: string;
}

export interface MarkdownSwiperSlide extends MarkdownImageDimensions {
  url: string;
  title: string;
}
