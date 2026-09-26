import { describe, expect, test } from "bun:test";

import {
  CITY_COORDS,
  FOREIGN_COORDS,
  PROVINCES,
  matchForeignCoord,
  type Coord,
} from "#shared/city-coords";

describe("PROVINCES(省/直辖市/自治区/特别行政区 简称集)", () => {
  test("含全部省级行政区(4 直辖市 + 23 省 + 5 自治区 + 港澳台 ≥ 30)", () => {
    expect(PROVINCES.size).toBeGreaterThanOrEqual(30);
  });

  test("四个直辖市在集中", () => {
    expect(PROVINCES.has("北京")).toBe(true);
    expect(PROVINCES.has("天津")).toBe(true);
    expect(PROVINCES.has("上海")).toBe(true);
    expect(PROVINCES.has("重庆")).toBe(true);
  });

  test("五个自治区在集中(含内蒙古/广西/西藏/宁夏/新疆)", () => {
    expect(PROVINCES.has("内蒙古")).toBe(true);
    expect(PROVINCES.has("广西")).toBe(true);
    expect(PROVINCES.has("西藏")).toBe(true);
    expect(PROVINCES.has("宁夏")).toBe(true);
    expect(PROVINCES.has("新疆")).toBe(true);
  });

  test("港澳台在集中", () => {
    expect(PROVINCES.has("香港")).toBe(true);
    expect(PROVINCES.has("澳门")).toBe(true);
    expect(PROVINCES.has("台湾")).toBe(true);
  });

  test("23 个省在集中", () => {
    const expected = [
      "河北", "山西", "辽宁", "吉林", "黑龙江", "江苏", "浙江", "安徽", "福建", "江西",
      "山东", "河南", "湖北", "湖南", "广东", "海南", "四川", "贵州", "云南", "陕西",
      "甘肃", "青海", "台湾",
    ];
    for (const p of expected) {
      expect(PROVINCES.has(p)).toBe(true);
    }
  });

  test("去后缀的省份简称(不是省/市/自治区全称)", () => {
    expect(PROVINCES.has("北京市")).toBe(false);
    expect(PROVINCES.has("江苏省")).toBe(false);
    expect(PROVINCES.has("内蒙古自治区")).toBe(false);
    expect(PROVINCES.has("新疆维吾尔自治区")).toBe(false);
  });
});

describe("CITY_COORDS", () => {
  test("省级与「省级简称」键共存(用于城市未命中时回退省级坐标)", () => {
    expect(CITY_COORDS.北京).toBeDefined();
    expect(CITY_COORDS.北京[0]).toBeCloseTo(116.41, 1);
    expect(CITY_COORDS.北京[1]).toBeCloseTo(39.9, 1);
    // 北京既是直辖市键,也是省级兜底键(实际上北京只有一个键,但其它省份同键共存)
    expect(CITY_COORDS.辽宁).toBeDefined();
    expect(CITY_COORDS.沈阳).toBeDefined(); // 城市
  });

  test("经纬度顺序为 [longitude, latitude] 与高德 LngLat 一致", () => {
    // 上海: 121.47 E, 31.23 N
    expect(CITY_COORDS.上海[0]).toBeCloseTo(121.47, 2);
    expect(CITY_COORDS.上海[1]).toBeCloseTo(31.23, 2);
  });

  test("省会坐标应在合理范围内(经度 73-135,纬度 3-54)", () => {
    for (const [name, [lng, lat]] of Object.entries(CITY_COORDS)) {
      expect(Number.isFinite(lng)).toBe(true);
      expect(Number.isFinite(lat)).toBe(true);
      expect(lng).toBeGreaterThan(73);
      expect(lng).toBeLessThan(135);
      expect(lat).toBeGreaterThan(3);
      expect(lat).toBeLessThan(54);
      // 防止错位 lng/lat 互换
      expect(name).toBeTruthy();
    }
  });

  test("吉林市与吉林省去后缀后键冲突,保留省级兜底键(吉林省会长春方向)", () => {
    expect(CITY_COORDS.吉林).toBeDefined();
    // 注释:保留省级键 (= 省会长春),实际坐标与长春相近(都在东北)
    const [lng, lat] = CITY_COORDS.吉林;
    expect(lng).toBeGreaterThan(124);
    expect(lng).toBeLessThan(127);
    expect(lat).toBeGreaterThan(42);
    expect(lat).toBeLessThan(45);
  });

  test("值的类型是 Coord 元组", () => {
    const coord = CITY_COORDS.北京;
    expect(Array.isArray(coord)).toBe(true);
    expect(coord).toHaveLength(2);
    expect(typeof coord[0]).toBe("number");
    expect(typeof coord[1]).toBe("number");
    // 类型断言测试
    const typed: Coord = coord;
    expect(typed).toEqual([116.41, 39.9]);
  });
});

describe("FOREIGN_COORDS", () => {
  test("覆盖常见博客托管国", () => {
    for (const country of ["美国", "日本", "新加坡", "德国", "英国", "加拿大"]) {
      expect(FOREIGN_COORDS[country]).toBeDefined();
      expect(FOREIGN_COORDS[country]).toHaveLength(2);
    }
  });

  test("至少覆盖 30 个国家", () => {
    expect(Object.keys(FOREIGN_COORDS).length).toBeGreaterThanOrEqual(30);
  });
});

describe("matchForeignCoord", () => {
  test("完整国名匹配", () => {
    const c = matchForeignCoord("美国 加利福尼亚 圣何塞");
    expect(c).toEqual([-95.71, 37.09]);
  });

  test("国名是 qqwry 原始串的子串即命中", () => {
    expect(matchForeignCoord("日本 东京")).toEqual([139.69, 35.69]);
    expect(matchForeignCoord("新加坡")).toEqual([103.82, 1.35]);
  });

  test("短名不会误匹配长名('印度' ≠ '印度尼西亚')", () => {
    // 关键:实现里按国名长度降序排,「印度尼西亚」(5 字) 必须排在「印度」(2 字) 之前
    expect(matchForeignCoord("印度尼西亚 雅加达")).toEqual([113.92, -0.79]);
    expect(matchForeignCoord("印度 孟买")).toEqual([78.96, 20.59]);
  });

  test("未命中 → null(端点将其计入海外桶,不伪造坐标)", () => {
    expect(matchForeignCoord("南极洲")).toBeNull();
    expect(matchForeignCoord("")).toBeNull();
    expect(matchForeignCoord("火星")).toBeNull();
  });

  test("国名出现位置无关(头部/中间/尾部都应命中)", () => {
    expect(matchForeignCoord("x 美国 y")).toEqual([-95.71, 37.09]);
    expect(matchForeignCoord("x y 美国")).toEqual([-95.71, 37.09]);
  });
});