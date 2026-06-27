// markdown-it-container 类型声明（包本身未提供）
declare module "markdown-it-container" {
  import type MarkdownIt from "markdown-it";

  interface ContainerOptions {
    validate?: (params: string, index: number) => boolean | RegExpMatchArray | null;
    render?: (tokens: EmptyObj[], index: number, options: EmptyObj, env: EmptyObj, self: EmptyObj) => string;
    marker?: string;
  }

  const container: (md: MarkdownIt, name: string, options?: ContainerOptions) => void;

  export default container;
}
