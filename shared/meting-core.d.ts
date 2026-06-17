// @meting/core 类型声明（包本身未提供，1.6.1 版本）
declare module "@meting/core" {
  // 所有 API 方法返回 JSON 字符串（在调用方通过 JSON.parse 解析）
  interface MetingInstance {
    format(enabled?: boolean): MetingInstance;
    playlist(id: string): Promise<string>;
    song(id: string): Promise<string>;
    url(id: string): Promise<string>;
    pic(id: string): Promise<string>;
    lyric(id: string): Promise<string>;
  }

  export default class Meting implements MetingInstance {
    constructor(server: string);
    format(enabled?: boolean): MetingInstance;
    playlist(id: string): Promise<string>;
    song(id: string): Promise<string>;
    url(id: string): Promise<string>;
    pic(id: string): Promise<string>;
    lyric(id: string): Promise<string>;
  }
}
