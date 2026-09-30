import { beforeEach, describe, expect, mock, test } from "bun:test";

import { resolveCity } from "#server/utils/ip-location";

// mock qqwry:根据 IP 字符串返回不同 location
const qqwryByIp = new Map<string, { location: string; isp: string }>();
mock.module("#server/utils/qqwry", () => ({
  getIpLocation: async (ip: string) => qqwryByIp.get(ip) ?? { location: "", isp: "" },
}));

beforeEach(() => {
  qqwryByIp.clear();
});

describe("resolveCity(IP→结构化地区)", () => {
  test("空 location → 国外", async () => {
    expect(await resolveCity("1.2.3.4")).toEqual({ city: null, province: null, isDomestic: false, country: "" });
  });

  test("空 IP 字符串 + 无 location → 国外", async () => {
    expect(await resolveCity("")).toEqual({ city: null, province: null, isDomestic: false, country: "" });
  });

  test("中国-省级-市级 → 解析省份 + 城市", async () => {
    qqwryByIp.set("1.2.3.4", { location: "辽宁-沈阳", isp: "" });
    const r = await resolveCity("1.2.3.4");
    expect(r.isDomestic).toBe(true);
    expect(r.province).toBe("辽宁");
    expect(r.city).toBe("沈阳");
  });

  test("中国-省级-市级-区 → 取城市(剥区级后缀)", async () => {
    qqwryByIp.set("1.2.3.4", { location: "辽宁-沈阳-沈河区", isp: "" });
    const r = await resolveCity("1.2.3.4");
    expect(r.province).toBe("辽宁");
    expect(r.city).toBe("沈阳");
  });

  test("直辖市(无省级)→ 仅省级,province 命中,city=null", async () => {
    qqwryByIp.set("1.2.3.4", { location: "北京", isp: "" });
    const r = await resolveCity("1.2.3.4");
    expect(r.isDomestic).toBe(true);
    expect(r.province).toBe("北京");
    expect(r.city).toBeNull();
  });

  test("香港 → province=香港,isDomestic=true,country=中国", async () => {
    qqwryByIp.set("1.2.3.4", { location: "香港", isp: "" });
    const r = await resolveCity("1.2.3.4");
    expect(r.province).toBe("香港");
    expect(r.isDomestic).toBe(true);
    expect(r.country).toBe("中国");
  });

  test("台湾 → province=台湾,isDomestic=true", async () => {
    qqwryByIp.set("1.2.3.4", { location: "台湾", isp: "" });
    const r = await resolveCity("1.2.3.4");
    expect(r.province).toBe("台湾");
    expect(r.isDomestic).toBe(true);
  });

  test("澳门 → province=澳门,isDomestic=true", async () => {
    qqwryByIp.set("1.2.3.4", { location: "澳门", isp: "" });
    const r = await resolveCity("1.2.3.4");
    expect(r.province).toBe("澳门");
    expect(r.isDomestic).toBe(true);
  });

  test("境外 IP → isDomestic=false,country=原文", async () => {
    qqwryByIp.set("8.8.8.8", { location: "United States", isp: "" });
    const r = await resolveCity("8.8.8.8");
    expect(r.isDomestic).toBe(false);
    expect(r.country).toBe("United States");
  });

  test("民族自治区全称归约:广西壮族自治区 → 广西", async () => {
    qqwryByIp.set("1.2.3.4", { location: "广西壮族自治区-南宁", isp: "" });
    const r = await resolveCity("1.2.3.4");
    expect(r.province).toBe("广西");
    expect(r.city).toBe("南宁");
  });

  test("省级剥后缀:江苏省 → 江苏", async () => {
    qqwryByIp.set("1.2.3.4", { location: "江苏省-南京市", isp: "" });
    const r = await resolveCity("1.2.3.4");
    expect(r.province).toBe("江苏");
    expect(r.city).toBe("南京");
  });
});