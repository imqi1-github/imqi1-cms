/**
 * 地图组件类型定义
 */

import "@amap/amap-jsapi-types";

/** 经纬度元组 */
export type LngLatTuple = [number, number];

/** 高德地图 SDK 命名空间类型别名 */
export type AMapNamespace = typeof AMap;

/** AMap.Map 实例还带有类型声明中未暴露的 resize、stopMove 方法 */
export type AMapMapInstance = AMap.Map & { resize?(): void; stopMove?(): void };

/** 高德经纬度对象（运行时由 SDK 提供，具备 getLng/getLat） */
export interface AMapLngLatLike {
  getLng(): number;
  getLat(): number;
}

/** 普通坐标对象（手动输入或序列化数据） */
export interface CoordRecord {
  lng?: number;
  lat?: number;
  longitude?: number;
  latitude?: number;
}

/** normalizeLngLat / 事件回调的合法输入：数组 | 高德 LngLat | 坐标对象 */
// export type LngLatInput = readonly [unknown, unknown] | AMapLngLatLike | CoordRecord;
export type LngLatInput = AMap.LngLatLike;

/** 地图点击 / 拖拽事件负载（均带 lnglat） */
export interface AMapMapEvent {
  lnglat: LngLatInput;
}

/** 高德聚合点击事件负载：包含 clusterData 数组（未类型化）和关联的 marker */
export interface AMapClusterEvent {
  clusterData?: unknown[];
  marker?: AMap.Marker;
  getPosition?(): LngLatInput;
  lnglat?: LngLatInput;
}

/** 旅行帖子 */
export interface TravelPost {
  url: string;
  title: string;
  coverCount: number;
  manyCovers: boolean;
}

/** 访客信息 */
export interface Reader {
  name: string;
  url: string | null;
  articleTitle: string | null;
  articleUrl: string | null;
  comment: string | null;
  avatar: string | null;
}

/** 地点信息 */
export interface Place {
  id: number;
  name: string;
  desc: string | null;
  cover: string | null;
  longitude: number;
  latitude: number;
  posts: TravelPost[];
  /** 访客分布视图：该城市内的每位访客（昵称 / 网址 / 评论文章）。我的足迹视图留空 */
  readers?: Reader[];
  /** 博客网络视图：站点头像（标记用）+ 来源（订阅/友链）+ 跳转信息。其它视图留空 */
  avatar?: string | null;
  source?: "subscribe" | "link";
  sourceId?: number | string;
  targetUrl?: string | null;
  serverLocation?: string | null;
  serverIsp?: string | null;
}

/** 地图标记点 */
export type MapPoint = { lnglat: LngLatTuple; id: number; place: Place };

/** 聚合点击时从 clusterData 规整出的点 */
export type ClusterPoint = { id?: number; place?: Place; lnglat: LngLatTuple };

/** 胶囊导航项 */
export type Capsule = { key: string; label: string; icon: string; to: string };

export type TravelItem = {
  name: string;
  create_time: string;
  posts: {
      cid: number;
      title: string;
  }[];
  desc: string | null;
  id: number;
  enabled: boolean;
  cover: string | null;
  longitude: number;
  latitude: number;
  sort: number;
  cids: number[];
}

export type PostListItem = {
  create_time: string;
  desc: string | null;
  cid: number;
  type: number;
  title: string;
  slug: string | null;
  content: string | null;
  update_time: string;
  status: number;
  comment_num: number;
  many_covers: boolean;
  covers: string | null;
  show_toc: boolean;
  tags: string | null;
  uid: number;
  user: {
      name: string;
      uid: number;
      avatar: string | null;
  };
  postrelations: {
      cid: number;
      mid: number;
      metas: {
          name: string;
          type: string;
          slug: string | null;
          mid: number;
      };
  }[];
}