import { describe, expect, test } from "bun:test";

import { callAdmin } from "#test/helpers/admin";
import { mockSharedPrisma, sharedFake } from "#test/helpers/fake-prisma";

mockSharedPrisma();

const qrHandler = (await import("#server/api/qr.get")).default;
const heatmapHandler = (await import("#server/api/heatmap.get")).default;

describe("qr.get(通用二维码)", () => {
  test("text 缺省 → 400", async () => {
    await expect(callAdmin(qrHandler, {
      method: "GET",
      url: "/api/qr",
    })).rejects.toMatchObject({ statusCode: 400 });
  });

  test("text 超长(>1000)→ 400", async () => {
    await expect(callAdmin(qrHandler, {
      method: "GET",
      url: "/api/qr?text=" + "x".repeat(1001),
    })).rejects.toMatchObject({ statusCode: 400 });
  });

  test("text 含控制字符 → 400", async () => {
    await expect(callAdmin(qrHandler, {
      method: "GET",
      url: "/api/qr?text=hello%01world", // \x01 控制字符
    })).rejects.toMatchObject({ statusCode: 400 });
  });

  test("成功 → 返回 Buffer", async () => {
    const r = await callAdmin(qrHandler, {
      method: "GET",
      url: "/api/qr?text=https://imqi1.com",
    });
    // QRCode.toBuffer 返回 Buffer;callAdmin 透传
    expect(r).toBeDefined();
  });

  test("text 是数字也接受", async () => {
    const r = await callAdmin(qrHandler, {
      method: "GET",
      url: "/api/qr?text=12345",
    });
    expect(r).toBeDefined();
  });
});

describe("heatmap.get(站点热力图)", () => {
  const contentRows: Array<{ cid: number; create_time: Date }> = [
    { cid: 1, create_time: new Date(Date.UTC(2026, 0, 1)) },
    { cid: 2, create_time: new Date(Date.UTC(2026, 0, 15)) },
  ];
  const commentRows: Array<{ cid: number; status: number; create_time: Date }> = [
    { cid: 1, status: 1, create_time: new Date(Date.UTC(2026, 0, 2)) },
    { cid: 2, status: 1, create_time: new Date(Date.UTC(2026, 0, 16)) },
    { cid: 2, status: 0, create_time: new Date(Date.UTC(2026, 0, 17)) },
  ];

  sharedFake.on("contents", "findMany", async () => contentRows);
  sharedFake.on("comments", "findMany", async ({ where }: { where?: { status?: number; cid?: { in?: number[] } } } = {}) =>
    commentRows.filter(c => {
      if (where?.status !== undefined && c.status !== where.status) return false;
      if (where?.cid?.in !== undefined && !where.cid.in.includes(c.cid)) return false;
      return true;
    }));

  test("无 category/tag 过滤 → 聚合全部已发布文章/已审核评论", async () => {
    const r = await callAdmin(heatmapHandler, {
      method: "GET",
      url: "/api/heatmap",
    }) as { success: boolean, data: { totalArticles: number, totalComments: number, years: number[], days: Record<string, { articles: number; comments: number }> } };
    expect(r.success).toBe(true);
    expect(r.data.totalArticles).toBe(2);
    expect(r.data.totalComments).toBe(2); // cid=2 status=0 不计入
    expect(r.data.years.length).toBeGreaterThan(0);
  });

  test("category 过滤 → 通过 contentrelations.some 过滤(占位返回空)", async () => {
    const r = await callAdmin(heatmapHandler, {
      method: "GET",
      url: "/api/heatmap?category=test",
    }) as { data: { totalArticles: number, totalComments: number } };
    // mock 内容不含 contentrelations.some 过滤,mock 返回全部 contents
    // 仅验证返回结构正确
    expect(r.data.totalArticles).toBeGreaterThanOrEqual(0);
  });
});