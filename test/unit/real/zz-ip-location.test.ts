// mock qqwry 的 location 串,驱动 resolveCity 全分支。
// 文件名 zz- 前缀:必须先于本文件加载 qqwry.test.ts,否则这里的 mock 会让真实查询测试空跑。
import { afterEach, describe, expect, mock, test } from "bun:test";

const rawByIp: Record<string, { location: string; isp: string } | null> = {};
mock.module("#server/utils/qqwry", () => ({
  getIpLocation: async (ip: string) => rawByIp[ip] ?? null,
  queryIpLocation: async () => null,
}));
const { resolveCity } = await import("#server/utils/ip-location");

afterEach(() => {
  for (const k of Object.keys(rawByIp)) Reflect.deleteProperty(rawByIp, k);
});

describe("ip-location.resolveCity 分支(受控 location 串)", () => {
  test("空结果 → 境外 unknown 形态", async () => {
    rawByIp["1.1.1.1"] = null;
    expect(await resolveCity("1.1.1.1")).toEqual({ city: null, province: null, isDomestic: false, country: "" });
  });

  test("港澳台归一为省级", async () => {
    rawByIp["1.1.1.2"] = { location: "中国香港", isp: "" };
    rawByIp["1.1.1.3"] = { location: "香港特别行政区", isp: "" };
    rawByIp["1.1.1.4"] = { location: "中国台湾-台北", isp: "" };
    rawByIp["1.1.1.5"] = { location: "中国澳门", isp: "" };
    expect(await resolveCity("1.1.1.2")).toMatchObject({ province: "香港", city: null, isDomestic: true });
    expect(await resolveCity("1.1.1.3")).toMatchObject({ province: "香港", city: null, isDomestic: true });
    expect(await resolveCity("1.1.1.4")).toMatchObject({ province: "台湾", city: null, isDomestic: true });
    expect(await resolveCity("1.1.1.5")).toMatchObject({ province: "澳门", city: null, isDomestic: true });
  });

  test("单字段城市(南京)与单字段省级(新疆)", async () => {
    rawByIp["2.2.2.1"] = { location: "南京", isp: "" };
    rawByIp["2.2.2.2"] = { location: "新疆", isp: "" };
    expect(await resolveCity("2.2.2.1")).toMatchObject({ city: "南京", province: null, isDomestic: true, country: "中国" });
    expect(await resolveCity("2.2.2.2")).toMatchObject({ city: null, province: "新疆", isDomestic: true });
  });

  test("标准两段(江苏省-南京市):省剥后缀、民族自治区归约", async () => {
    rawByIp["3.3.3.1"] = { location: "中国-江苏省-南京市-鼓楼区", isp: "" };
    const jiangsu = await resolveCity("3.3.3.1");
    expect(jiangsu).toMatchObject({ city: "南京", province: "江苏", isDomestic: true, country: "中国" });

    rawByIp["3.3.3.2"] = { location: "中国-广西壮族自治区-南宁市", isp: "" };
    expect(await resolveCity("3.3.3.2")).toMatchObject({ province: "广西", city: "南宁", isDomestic: true });
  });

  test("省级不在坐标表 → 境外(原文作 country);空段 → 境外", async () => {
    rawByIp["4.4.4.1"] = { location: "亚特兰蒂斯-深海", isp: "" };
    expect(await resolveCity("4.4.4.1")).toEqual({ city: null, province: null, isDomestic: false, country: "亚特兰蒂斯-深海" });
    rawByIp["4.4.4.2"] = { location: "中国---", isp: "" };
    const emptyParts = await resolveCity("4.4.4.2");
    expect(emptyParts.isDomestic).toBe(false);
  });

  test("resolveCity 不做映射归一(那是 qqwry.normalizeIp 的职责):原样透传", async () => {
    rawByIp["::ffff:5.5.5.5"] = { location: "南京", isp: "" };
    expect(await resolveCity("::ffff:5.5.5.5")).toMatchObject({ city: "南京", isDomestic: true });
  });
});
