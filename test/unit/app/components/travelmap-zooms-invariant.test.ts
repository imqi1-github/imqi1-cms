/**
 * TravelMap 地图初始化 zooms 上限硬编码 20(记忆 travelmap-maxzoom-sync-createcluster):
 *  - 高德底图 POI 图层按**初始化** zooms 上限锁定,运行时 setZooms 放开无效
 *  - 若初始化用 `props.maxZoom ?? 20`,footprint/blogs 进入时 zooms=[4,9] → POI 图层锁定 9 → 切 travels
 *    后放大到街道级底图 POI 全消失
 *  - 正确写法:初始化 zooms 上限固定 20,footprint/blogs 的 9 级封顶交给 createCluster 内运行时 setZooms
 *  - effectiveMax(给 createCluster / maxZoom)必须与 map 实际上限(20)对齐,否则聚合关闭 → 同坐标点退化像素重叠
 *
 * 由于这是源码硬编码不变式,本测试通过读 .vue 源码做字符串守卫,而不是 mount Vue 组件
 * (避免引入 AMap 全局依赖)。这种「源码字面量断言」适合 lint 抓不到的关键常量。
 */
import { readFileSync } from "node:fs";

import { describe, expect, test } from "bun:test";

const src = readFileSync("app/components/TravelMap.vue", "utf8");

describe("TravelMap zooms 上限硬编码不变式", () => {
  test("map 初始化 zooms 上限必须字面 20,不能用 props.maxZoom ?? 20", () => {
    expect(src).toMatch(/zooms:\s*\[props\.minZoom\s*\?\?\s*MIN_ZOOM_DEFAULT\s*,\s*20\]/);
    // 反向断言:不能写 [props.minZoom ?? MIN_ZOOM_DEFAULT, props.maxZoom ?? 20]
    expect(src).not.toMatch(/zooms:\s*\[props\.minZoom[^\]]*props\.maxZoom/);
  });

  test("effectiveMax 默认 20,footprint/blogs 封顶走 createCluster 内 setZooms", () => {
    expect(src).toMatch(/effectiveMax\s*=\s*props\.maxZoom\s*\?\?\s*20/);
    // effectiveMax 必须出现在 createCluster 内的 setZooms 调用里(不是独立的 maxZoom watch)
    expect(src).toMatch(/setZooms\?\.\(\[\s*props\.minZoom\s*\?\?\s*MIN_ZOOM_DEFAULT\s*,\s*effectiveMax\s*\]\)/);
  });

  test("MarkerClusterer maxZoom 与 map 上限同源(effectiveMax),避免 19~20 级聚合被关", () => {
    expect(src).toMatch(/maxZoom:\s*effectiveMax/);
  });

  test("地图缩放钳制使用 effectiveMax,不是写死 18/19", () => {
    // 钳制用 Math.min(currentZoom + 2, effectiveMax) / currentZoom < effectiveMax - 0.5
    expect(src).toMatch(/Math\.min\(currentZoom\s*\+\s*2\s*,\s*effectiveMax\)/);
    expect(src).toMatch(/currentZoom\s*<\s*effectiveMax\s*-\s*0\.5/);
    // 反向断言:不能出现 maxZoom 写死 18/19/17(POI 9 级封顶外的城市级封顶应走 props.maxZoom ?? 20)
    expect(src).not.toMatch(/maxZoom:\s*1[789]\b/);
    expect(src).not.toMatch(/effectiveMax\s*=\s*1[789]\b/);
  });

  test("地图缩放下限用 MIN_ZOOM_DEFAULT=4(防缩到全球中国缩成小点)", () => {
    expect(src).toMatch(/const\s+MIN_ZOOM_DEFAULT\s*=\s*4/);
    expect(src).toMatch(/Math\.max\(MIN_ZOOM_DEFAULT\s*,\s*Math\.round\(z\)\)/);
  });

  test("没有独立的 maxZoom watch 提前 setZooms(避免 places 空期间 map 无点却允许街道级放大)", () => {
    // 反向断言:不能有 watch(maxZoom) → setZooms([..., maxZoom])
    // 模式:watch 监听 maxZoom 触发 setZooms(用 props.maxZoom 而不是 effectiveMax)
    const hasStandaloneMaxZoomWatch = /watch\s*\(\s*[^)]*maxZoom[^)]*\)\s*[^}]*setZooms\s*\(\s*\[/.test(src.replace(/\n/g, " "));
    expect(hasStandaloneMaxZoomWatch).toBe(false);
  });
});