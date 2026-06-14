// bcryptjs 2.x 类型声明（仅覆盖项目中实际使用的 API）
declare module "bcryptjs" {
  export function hash(s: string, saltOrRounds: string | number): Promise<string>;
  export function hashSync(s: string, saltOrRounds: string | number): string;
  export function compare(s: string, hash: string): Promise<boolean>;
  export function compareSync(s: string, hash: string): boolean;
  export function genSalt(rounds?: number): Promise<string>;
  export function genSaltSync(rounds?: number): string;

  // 兼容 CJS 互操作下的 `bcrypt.default.xxx` 写法（见 server/lib/auth.ts）
  const _default: {
    hash: typeof hash;
    hashSync: typeof hashSync;
    compare: typeof compare;
    compareSync: typeof compareSync;
    genSalt: typeof genSalt;
    genSaltSync: typeof genSaltSync;
  };
  export { _default as default };
}
