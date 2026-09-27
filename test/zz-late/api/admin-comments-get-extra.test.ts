import { beforeEach, describe, expect, mock, test } from "bun:test";

import { callAdmin, loginSessionCookie } from "#test/helpers/admin";
import { mockSharedPrisma, sharedFake } from "#test/helpers/fake-prisma";

mockSharedPrisma();

const qqwryByIp = new Map<string, { location: string; isp: string }>();
mock.module("#server/utils/qqwry", () => ({
  getIpLocation: async (ip: string) => qqwryByIp.get(ip) ?? { location: "", isp: "" },
}));

const handler = (await import("#server/api/admin/comments.get")).default;

beforeEach(() => { qqwryByIp.clear(); });

describe("admin/comments.get(评论管理) location 解析分支", () => {
  test("location 单段(只有省份,无城市)→ 取 parts[0]", async () => {
    qqwryByIp.set("1.1.1.1", { location: "辽宁", isp: "" });
    sharedFake.on("comments", "findMany", async () => [{
      coid: 1, cid: 1, name: "x", mail: null, link: null, content: "y",
      create_time: new Date(), status: 1, parent_id: null, agent: null, ip: "1.1.1.1",
    }]);
    sharedFake.on("comments", "count", async () => 1);
    const cookie = await loginSessionCookie();
    const r = await callAdmin(handler, { method: "GET", cookie }) as { data: Array<{ location: string }> };
    expect(r.data[0]!.location).toBe("辽宁");
  });

  test("location 多段(省-市-区)→ 取 parts[1] 即城市", async () => {
    qqwryByIp.set("1.1.1.1", { location: "辽宁-沈阳-沈河区", isp: "" });
    sharedFake.on("comments", "findMany", async () => [{
      coid: 1, cid: 1, name: "x", mail: null, link: null, content: "y",
      create_time: new Date(), status: 1, parent_id: null, agent: null, ip: "1.1.1.1",
    }]);
    sharedFake.on("comments", "count", async () => 1);
    const cookie = await loginSessionCookie();
    const r = await callAdmin(handler, { method: "GET", cookie }) as { data: Array<{ location: string }> };
    expect(r.data[0]!.location).toBe("沈阳");
  });

  test("location 香港特别行政区 → 「香港特区」", async () => {
    qqwryByIp.set("1.1.1.1", { location: "香港特别行政区", isp: "" });
    sharedFake.on("comments", "findMany", async () => [{
      coid: 1, cid: 1, name: "x", mail: null, link: null, content: "y",
      create_time: new Date(), status: 1, parent_id: null, agent: null, ip: "1.1.1.1",
    }]);
    sharedFake.on("comments", "count", async () => 1);
    const cookie = await loginSessionCookie();
    const r = await callAdmin(handler, { method: "GET", cookie }) as { data: Array<{ location: string }> };
    expect(r.data[0]!.location).toBe("香港特区");
  });

  test("location 空 → location 字段为空字符串", async () => {
    qqwryByIp.set("1.1.1.1", { location: "", isp: "" });
    sharedFake.on("comments", "findMany", async () => [{
      coid: 1, cid: 1, name: "x", mail: null, link: null, content: "y",
      create_time: new Date(), status: 1, parent_id: null, agent: null, ip: "1.1.1.1",
    }]);
    sharedFake.on("comments", "count", async () => 1);
    const cookie = await loginSessionCookie();
    const r = await callAdmin(handler, { method: "GET", cookie }) as { data: Array<{ location: string }> };
    expect(r.data[0]!.location).toBe("");
  });
});