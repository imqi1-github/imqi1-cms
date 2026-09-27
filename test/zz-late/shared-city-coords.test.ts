/**
 * shared/city-coords.ts 集成测(纯函数,直接 import 真实现):
 *  - PROVINCES 集合:覆盖 4 直辖市 + 23 省 + 5 自治区 + 2 特别行政区
 *  - CITY_COORDS:
 *    - 含全部 34 省级兜底键(直辖市/省/自治区/特区)
 *    - 至少一个直辖市 + 一个省会 + 一个地级市坐标精确
 *    - 经纬度顺序为 [lng, lat](与高德 LngLat 一致)
 *  - matchForeignCoord:
 *    - 命中已知国家 → 返对应坐标
 *    - 长国名优先于短国名(避免「印度」误匹配「印度尼西亚」)
 *    - 未命中 → null
 *    - 子串匹配(「美国 加利福尼亚 圣何塞」也能命中)
 */
import { describe, expect, test } from "bun:test";

import { CITY_COORDS, FOREIGN_COORDS, PROVINCES, matchForeignCoord } from "#shared/city-coords";

describe("PROVINCES", () => {
  test("4 直辖市 + 23 省 + 5 自治区 + 2 特别行政区 = 34 个", () => {
    expect(PROVINCES.size).toBe(34);
  });

  test("含全部直辖市", () => {
    for (const name of ["北京", "天津", "上海", "重庆"]) expect(PROVINCES.has(name)).toBe(true);
  });

  test("含全部特别行政区", () => {
    expect(PROVINCES.has("香港")).toBe(true);
    expect(PROVINCES.has("澳门")).toBe(true);
  });

  test("含全部 5 个自治区", () => {
    for (const name of ["内蒙古", "广西", "西藏", "宁夏", "新疆"]) {
      expect(PROVINCES.has(name)).toBe(true);
    }
  });

  test("不含海外国家名(避免误判归属地)", () => {
    expect(PROVINCES.has("美国")).toBe(false);
    expect(PROVINCES.has("日本")).toBe(false);
  });
});

describe("CITY_COORDS", () => {
  test("每个省级键都在 PROVINCES 里(防止 province 表与坐标表不一致)", () => {
    // 34 个省级兜底键,key 必须出现在 PROVINCES 集合
    for (const name of PROVINCES) {
      expect(CITY_COORDS[name]).toBeDefined();
    }
  });

  test("4 直辖市坐标精确", () => {
    expect(CITY_COORDS.北京).toEqual([116.41, 39.9]);
    expect(CITY_COORDS.上海).toEqual([121.47, 31.23]);
    expect(CITY_COORDS.天津).toEqual([117.2, 39.09]);
    expect(CITY_COORDS.重庆).toEqual([106.55, 29.56]);
  });

  test("省会坐标精确", () => {
    expect(CITY_COORDS.广州).toEqual([113.26, 23.13]);
    expect(CITY_COORDS.杭州).toEqual([120.21, 30.25]);
    expect(CITY_COORDS.成都).toEqual([104.06, 30.57]);
  });

  test("地级市坐标存在", () => {
    expect(CITY_COORDS.深圳).toEqual([114.06, 22.54]);
    expect(CITY_COORDS.南京).toEqual([118.8, 32.06]);
  });

  test("经纬度顺序为 [lng, lat](与高德 LngLat 一致)", () => {
    const [lng, lat] = CITY_COORDS.北京!;
    // 经度应在 73~135 之间(中国陆地范围)
    expect(lng).toBeGreaterThan(73);
    expect(lng).toBeLessThan(135);
    // 纬度应在 4~54 之间
    expect(lat).toBeGreaterThan(4);
    expect(lat).toBeLessThan(54);
  });

  test("吉林冲突已知:地级「吉林市」与省「吉林省」去后缀同为「吉林」,保留省级兜底键", () => {
    // 实际实现把 吉林 键定义为省坐标(≈省会长春),不指向吉林市
    expect(CITY_COORDS.吉林).toBeDefined();
    expect(CITY_COORDS.吉林).toEqual([125.33, 43.9]);
  });
});

describe("matchForeignCoord", () => {
  test("命中已知国家(美国)→ 返美国坐标", () => {
    const c = matchForeignCoord("美国 加利福尼亚 圣何塞");
    expect(c).toEqual(FOREIGN_COORDS.美国);
  });

  test("命中日本 → 日本坐标", () => {
    expect(matchForeignCoord("日本 东京都")).toEqual(FOREIGN_COORDS.日本);
  });

  test("子串匹配:qqwry 原始串里只含国名子串也能命中", () => {
    expect(matchForeignCoord("United States 美国")).not.toBeNull();
  });

  test("长国名优先于短国名(印度 vs 印度尼西亚)", () => {
    // "印度尼西亚" 是较长字符串,排序在前 → 必须先命中
    expect(matchForeignCoord("印度尼西亚")).toEqual(FOREIGN_COORDS.印度尼西亚);
    // "印度" 单独出现 → 命中印度
    expect(matchForeignCoord("印度")).toEqual(FOREIGN_COORDS.印度);
  });

  test("未命中 → null(不伪造坐标)", () => {
    expect(matchForeignCoord("亚特兰蒂斯")).toBeNull();
    expect(matchForeignCoord("")).toBeNull();
  });

  test("空字符串 → null(不抛)", () => {
    expect(matchForeignCoord("")).toBeNull();
  });
});