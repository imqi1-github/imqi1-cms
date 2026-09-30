import { expect, test } from "@playwright/test";

// 公开 API 冒烟:走真实 SSR 内部链路,回归接口可达性
test.describe("公开 API", () => {
  test("GET /api/stats → 200", async ({ request }) => {
    const res = await request.get("/api/stats");
    expect(res.status()).toBe(200);
    expect(await res.text()).not.toBe("");
  });

  test("GET /api/tags → 200", async ({ request }) => {
    const res = await request.get("/api/tags");
    expect(res.status()).toBe(200);
  });
});
