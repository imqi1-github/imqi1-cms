import { describe, expect, test } from "bun:test";

import { expandIpv6, matchIpPattern, parseIpBytes } from "../../../server/utils/ip-match";

describe("expandIpv6", () => {
  test("完整展开 8 组", () => {
    expect(expandIpv6("2001:db8::1")).toEqual([0x2001, 0xdb8, 0, 0, 0, 0, 0, 1]);
  });

  test(":: 展开为全零", () => {
    expect(expandIpv6("::")).toEqual([0, 0, 0, 0, 0, 0, 0, 0]);
  });

  test("多个 :: 返回空数组", () => {
    expect(expandIpv6("1::2::3")).toEqual([]);
  });

  test("超过 8 组返回空数组", () => {
    expect(expandIpv6("1:2:3:4:5:6:7:8:9")).toEqual([]);
  });
});

describe("parseIpBytes", () => {
  test("IPv4 返回 4 字节", () => {
    expect(parseIpBytes("172.26.0.1")).toEqual([172, 26, 0, 1]);
  });

  test("点分映射写法归一成 4 字节", () => {
    expect(parseIpBytes("::ffff:172.26.0.1")).toEqual([172, 26, 0, 1]);
  });

  test("十六进制映射写法(Node 规范化产物)同样归一", () => {
    // ::ffff:a9fe:a9fe == 169.254.169.254(云元数据)
    expect(parseIpBytes("::ffff:a9fe:a9fe")).toEqual([169, 254, 169, 254]);
  });

  test("普通 IPv6 返回 16 字节", () => {
    expect(parseIpBytes("fe80::1")).toHaveLength(16);
    expect(parseIpBytes("::1")).toHaveLength(16);
  });

  test("非法输入返回 null", () => {
    expect(parseIpBytes("not-an-ip")).toBeNull();
    expect(parseIpBytes("")).toBeNull();
  });
});

describe("matchIpPattern", () => {
  describe("CIDR 匹配", () => {
    test("docker 网桥网关命中 172.16.0.0/12", () => {
      expect(matchIpPattern("172.26.0.1", "172.16.0.0/12")).toBe(true);
    });

    test("/12 边界外不命中(172.32.0.0 已超出 172.16.0.0/12)", () => {
      expect(matchIpPattern("172.32.0.1", "172.16.0.0/12")).toBe(false);
    });

    test("IPv4 映射对端(点分写法)命中 IPv4 网段", () => {
      expect(matchIpPattern("::ffff:172.26.0.1", "172.16.0.0/12")).toBe(true);
    });

    test("IPv4 映射对端(hex 写法)命中 IPv4 网段", () => {
      expect(matchIpPattern("::ffff:a9fe:a9fe", "169.254.0.0/16")).toBe(true);
    });

    test("fe80::/10 覆盖 febf(fe80 段是 /10 不是 /16)", () => {
      expect(matchIpPattern("fe80::1", "fe80::/10")).toBe(true);
      expect(matchIpPattern("febf::1", "fe80::/10")).toBe(true);
      expect(matchIpPattern("fec0::1", "fe80::/10")).toBe(false);
    });

    test("非整前缀或越界前缀返回 false", () => {
      expect(matchIpPattern("1.2.3.4", "1.2.3.4/abc")).toBe(false);
      expect(matchIpPattern("1.2.3.4", "1.2.3.4/33")).toBe(false);
    });
  });

  describe("精确匹配", () => {
    test("两侧写法不同但归一后相等", () => {
      expect(matchIpPattern("::ffff:192.168.1.1", "192.168.1.1")).toBe(true);
      expect(matchIpPattern("192.168.1.1", "::ffff:192.168.1.1")).toBe(true);
    });

    test("地址族不同返回 false", () => {
      expect(matchIpPattern("1.2.3.4", "::1")).toBe(false);
    });

    test("任一侧解析失败返回 false", () => {
      expect(matchIpPattern("bad", "1.2.3.4")).toBe(false);
      expect(matchIpPattern("1.2.3.4", "bad")).toBe(false);
    });
  });
});
