// smoothscroll 类型声明（包本身未提供）
declare module "smoothscroll" {
  const smoothScroll: (
    to: number,
    duration: number,
    callback?: (() => void) | null,
    element?: HTMLElement,
  ) => void;
  export default smoothScroll;
}
