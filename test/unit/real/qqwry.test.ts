// 真实 qqwry 查询测试(读 server/runtime-assets/qqwry.ipdb)。
// 本文件刻意不含任何 mock.mock——同文件内的 mock.module 会连本文件的真实导入一起替换,
// 曾致断言走 null 分支静默通过(coverage 0% 暴露)。mock qqwry 的用例见 zz-ip-location.test.ts。
import { describe, expect, test } from "bun:test";

const qqwryReal = await import("#server/utils/qqwry");

describe("qqwry 真实查询(qqwry.ipdb)", () => {
  test("非法 IP 直接 null(不进库查询)", async () => {
    await expect(qqwryReal.queryIpLocation("not-an-ip")).resolves.toBeNull();
    await expect(qqwryReal.queryIpLocation("999.1.1.1")).resolves.toBeNull();
    await expect(qqwryReal.queryIpLocation("")).resolves.toBeNull();
  });

  test("公网 IP 返回结构化归属地,第二次命中缓存且值相等", async () => {
    const detail = await qqwryReal.queryIpLocation("114.114.114.114");
    expect(detail).not.toBeNull();
    expect(typeof detail!.country).toBe("string");
    expect(detail!.country.length).toBeGreaterThan(0);
    expect(await qqwryReal.queryIpLocation("114.114.114.114")).toEqual(detail);
  });

  test("getIpLocation 把 detail 映射为 {location, isp}", async () => {
    const r = await qqwryReal.getIpLocation("114.114.114.114");
    const detail = await qqwryReal.queryIpLocation("114.114.114.114");
    expect(r).toEqual({ location: detail!.country, isp: detail!.area });
  });

  test("IPv4 映射 IPv6 与裸 IPv4 命中同一缓存条目", async () => {
    const direct = await qqwryReal.queryIpLocation("114.114.114.114");
    expect(await qqwryReal.queryIpLocation("::ffff:114.114.114.114")).toEqual(direct);
  });
});
