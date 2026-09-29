// happy-dom 与 lib.dom 类型不互通(happy-dom 类极简,lib.dom interface 132+ 属性),
// test 端把 happy-dom 实例传给期望 lib.dom 类型的函数时统一走这里的 double cast。
// 改 composable 签名或 lib.dom 类型定义都是高风险,单点 cast 最稳。
export const libEl = <T>(el: T): HTMLElement => el as unknown as HTMLElement;
export const libElOrNull = <T>(el: T | null): HTMLElement | null =>
  el === null ? null : (el as unknown as HTMLElement);
export const libParent = <T>(el: T): ParentNode => el as unknown as ParentNode;
export const libEvent = <T>(e: T): Event => e as unknown as Event;
export const libElement = <T>(el: T): Element => el as unknown as Element;
