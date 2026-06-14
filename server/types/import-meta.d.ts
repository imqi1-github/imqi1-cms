// Nitro server 端 import.meta.env 类型扩展
// Nitro 实际注入了 env 变量，但默认类型声明不完整，需要手动补充
interface ImportMeta {
  readonly env: {
    readonly DEV: boolean;
    readonly PROD: boolean;
    readonly SSR: boolean;
    readonly MODE: string;
    readonly BASE_URL: string;
    readonly key?: string;
    readonly [key: string]: unknown;
  };
}
