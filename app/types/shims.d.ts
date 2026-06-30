declare module "swiper/css";
declare module "swiper/css/navigation";
declare module "swiper/css/pagination";
declare module "swiper/css/effect-fade";
declare module "swiper/css/effect-coverflow";
declare module "swiper/css/scrollbar";
declare module "swiper/css/thumbs";
declare module "swiper/css/free-mode";
declare module "swiper/css/grid";
declare module "*.css";
declare module "*.vue";

declare module "smoothscroll" {
  const smoothScroll: (
    to: number,
    duration: number,
    callback?: (() => void) | null,
    element?: HTMLElement,
  ) => void;
  export default smoothScroll;
}
