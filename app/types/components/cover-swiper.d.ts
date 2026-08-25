import type Swiper from "swiper";

/** swiper 实例类型别名（typeof default），供组件持有可解析的 Swiper 实例引用 */
export type SwiperType = typeof Swiper;

interface Cover {
  url: string;
  desc?: string;
  width?: number | null;
  height?: number | null;
}

export interface Props {
  covers: Cover[];
  isPhotoCategory?: boolean;
}
