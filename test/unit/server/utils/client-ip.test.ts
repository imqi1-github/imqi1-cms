import "#test/helpers/nitro-globals";

import { describe, expect, test } from "bun:test";

import { getClientIp } from "#server/utils/client-ip";

// 造一个最小 H3Event 形状:getHeader 读 node.req.headers,getClientIp 读 context.clientAddress 与 socket
function makeEvent(peer: string, headers: Record<string, string> = {}) {
  return {
    context: { clientAddress: peer },
    node: {
      req: {
        socket: { remoteAddress: peer },
        headers: Object.fromEntries(Object.entries(headers).map(([k, v]) => [k.toLowerCase(), v])),
      },
    },
  } as unknown as Parameters<typeof getClientIp>[0];
}

// TRUSTED_PROXY 是进程级 env,用例间必须还原避免污染其它测试
const ORIGINAL_PROXY = process.env.TRUSTED_PROXY;

function withProxy(value: string | undefined, fn: () => void): void {
  if (value === undefined) delete process.env.TRUSTED_PROXY;
  else process.env.TRUSTED_PROXY = value;
  try {
    fn();
  } finally {
    if (ORIGINAL_PROXY === undefined) delete process.env.TRUSTED_PROXY;
    else process.env.TRUSTED_PROXY = ORIGINAL_PROXY;
  }
}

describe("getClientIp:非受信对端", () => {
  test("公网对端直接用 socket 地址,代理头被丢弃(防伪造)", () => {
    withProxy(undefined, () => {
      const ip = getClientIp(makeEvent("8.8.8.8", { "x-real-ip": "1.2.3.4", "x-forwarded-for": "5.6.7.8" }));
      expect(ip).toBe("8.8.8.8");
    });
  });

  test("对端为空返回 unknown", () => {
    withProxy(undefined, () => {
      expect(getClientIp(makeEvent(""))).toBe("unknown");
    });
  });
});

describe("getClientIp:loopback 对端(本机反代)", () => {
  test("优先 x-real-ip", () => {
    const ip = getClientIp(makeEvent("127.0.0.1", { "x-real-ip": "1.2.3.4", "x-forwarded-for": "5.6.7.8" }));
    expect(ip).toBe("1.2.3.4");
  });

  test("无 x-real-ip 时取 x-forwarded-for 最右非 unknown 段", () => {
    const ip = getClientIp(makeEvent("127.0.0.1", { "x-forwarded-for": "1.1.1.1, 2.2.2.2, unknown" }));
    expect(ip).toBe("2.2.2.2");
  });

  test("两者皆无回落对端", () => {
    expect(getClientIp(makeEvent("127.0.0.1"))).toBe("127.0.0.1");
  });

  test("xff 全是 unknown/空段时跳过全部段落回落对端", () => {
    const ip = getClientIp(makeEvent("127.0.0.1", { "x-forwarded-for": "unknown, , unknown" }));
    expect(ip).toBe("127.0.0.1");
  });

  test("::1 对端同样受信", () => {
    expect(getClientIp(makeEvent("::1", { "x-real-ip": "9.9.9.9" }))).toBe("9.9.9.9");
  });
});

describe("getClientIp:TRUSTED_PROXY 白名单", () => {
  test("CIDR 网段命中后采信转发头(docker 网桥网关场景)", () => {
    withProxy("172.16.0.0/12", () => {
      const ip = getClientIp(makeEvent("172.26.0.1", { "x-real-ip": "203.0.113.7" }));
      expect(ip).toBe("203.0.113.7");
    });
  });

  test("网段未命中则头被丢弃", () => {
    withProxy("172.16.0.0/12", () => {
      const ip = getClientIp(makeEvent("192.168.100.1", { "x-real-ip": "203.0.113.7" }));
      expect(ip).toBe("192.168.100.1");
    });
  });

  test("IPv4 映射写法的对端可命中 IPv4 精确白名单", () => {
    withProxy("172.26.0.1", () => {
      const ip = getClientIp(makeEvent("::ffff:172.26.0.1", { "x-real-ip": "203.0.113.7" }));
      expect(ip).toBe("203.0.113.7");
    });
  });

  test("多个网段逗号分隔", () => {
    withProxy("10.0.0.0/8, 100.64.0.0/10", () => {
      const ip = getClientIp(makeEvent("100.64.0.1", { "x-real-ip": "203.0.113.7" }));
      expect(ip).toBe("203.0.113.7");
    });
  });
});
