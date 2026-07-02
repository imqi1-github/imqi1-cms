export interface MarkdownImageDimensions {
  width: number | string | null;
  height: number | string | null;
}

export interface MarkdownImageMountOptions {
  resolveDimensions?: (src: string) => MarkdownImageDimensions;
}
