// markdown-it-container 类型声明（包本身未提供）
declare module "markdown-it-container" {
  import type MarkdownIt from "markdown-it";
  import type PluginSimple from "markdown-it";

  interface ContainerOptions {
    validate?: (params: string, index: number) => boolean | RegExpMatchArray | null;
    render?: (tokens: any[], index: number, options: any, env: any, self: any) => string;
    marker?: string;
  }

  const container: (
    md: MarkdownIt,
    name: string,
    options?: ContainerOptions
  ) => void;

  export default container;
}
