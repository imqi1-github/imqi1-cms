import { expect, test } from "@playwright/test";

import { ADMIN_SKIP_MSG, loginAdmin } from "./_admin";

/**
 * SSR HTML 与登录态无关 —— CDN 边缘缓存的前提。
 *
 * 边缘把同一份 HTML 发给所有访客：登录态一旦进了 SSR，就会把 A 的「前往后台」页面发给 B。
 * 现状是安全的（登录态 UI 全在 <ClientOnly> 里，SSR 阶段 isLoggedIn 恒 false）。
 *
 * 三层断言：
 *   1. SSR 里不得出现任何后台入口（真元素，不是 Vue 模板注释）
 *   2. SSR 里不得出现登录用户的身份标识（邮箱——公开接口不下发 mail，可作特征串）
 *   3. 匿名与登录态的 SSR 归一化后应一致（页面自身含易变内容时跳过并记注解）
 *
 * 注意：登录 admin 会踢掉同账号的现有后台会话（单端登录），与其他 e2e 用例同口径。
 */

// 真元素标记（模板注释里会出现「后台管理按钮」字样，但不是真实 UI，不能当判据）
const ADMIN_MARKERS = ['aria-label="后台管理"', "/admin/contents/edit", "/admin/travels", 'href="/admin'];

/** 归一化易变内容：数字（含 payload 的 devalue 索引、时间戳、计数）、相对时间文案 */
function normalize(html: string): string {
  return html.replace(/\d+/g, "#").replace(/#\s*(?:秒|分钟|小时|天|周|个月|年)前/g, "#前");
}

/**
 * 去掉 __NUXT_DATA__ payload 脚本再做等值比较。
 *
 * payload 里是 devalue 扁平化结构，asyncData 的键是否落进 payload 取决于那次 SSR 的时序
 * （dev 下尤其明显），跟登录态无关；而真正的身份泄露由「邮箱/后台入口」两条断言负责
 * （那两条看的是**含 payload 的完整 HTML**）。
 */
function stripPayload(html: string): string {
  return html.replace(/<script type="application\/json"[^>]*data-nuxt-data[^>]*>[\s\S]*?<\/script>/g, "");
}

async function fetchHtml(page: import("@playwright/test").Page, path: string): Promise<string> {
  return (await page.request.get(path)).text();
}

/** 断言：HTML 里没有后台入口、也没有登录用户身份 */
function assertNoUserState(html: string, path: string, mail: string | null): void {
  for (const marker of ADMIN_MARKERS) {
    expect(html, `${path} 的 SSR HTML 不该含后台入口 ${marker}`).not.toContain(marker);
  }
  if (mail) {
    expect(html, `${path} 的 SSR HTML 泄露了登录用户邮箱`).not.toContain(mail);
  }
}

test.describe("SSR HTML 与登录态无关（CDN 边缘缓存前提）", () => {
  const pages = ["/", "/archiving", "/changelogs", "/links", "/subscribes", "/messages", "/map", "/about"];

  for (const path of pages) {
    test(`${path} 的 SSR 不含后台入口与用户身份`, async ({ page }) => {
      const anon = await fetchHtml(page, path);
      assertNoUserState(anon, path, null);

      if (!(await loginAdmin(page.request))) {
        test.skip(true, ADMIN_SKIP_MSG);
      }
      const verify = (await (await page.request.get("/api/auth/verify")).json()) as {
        user?: { mail?: string | null } | null;
      };
      const mail = verify.user?.mail ?? null;

      const auth = await fetchHtml(page, path);
      assertNoUserState(auth, path, mail);
    });

    test(`${path} 匿名与登录态的 SSR 一致`, async ({ page }) => {
      const anon1 = await fetchHtml(page, path);
      const anon2 = await fetchHtml(page, path);
      const baseline = normalize(stripPayload(anon1));

      // 基线：同状态抓两次应一致，否则该页有未识别的易变内容（随机排序/随机 id），等值断言不可靠
      if (baseline !== normalize(stripPayload(anon2))) {
        test.info().annotations.push({ type: "note", description: "该页含易变内容，等值断言跳过" });
        return;
      }

      if (!(await loginAdmin(page.request))) {
        test.skip(true, ADMIN_SKIP_MSG);
      }
      const auth = await fetchHtml(page, path);
      expect(normalize(stripPayload(auth)), `${path} 的 SSR HTML 随登录态变化了`).toBe(baseline);
    });
  }

  test("文章详情页（含「编辑此文章」入口）的 SSR 与登录态无关", async ({ page }) => {
    test.setTimeout(60_000); // 含登录与多次抓取，默认 30s 不够
    const home = await fetchHtml(page, "/");
    const match = home.match(/href="(\/content\/[^"?#]+)"/);
    test.skip(!match, "首页没有可访问的文章链接（开发库为空），跳过");
    const path = match![1]!;

    const anon = await fetchHtml(page, path);
    assertNoUserState(anon, path, null);

    if (!(await loginAdmin(page.request))) {
      test.skip(true, ADMIN_SKIP_MSG);
    }
    const verify = (await (await page.request.get("/api/auth/verify")).json()) as {
      user?: { mail?: string | null } | null;
    };
    const auth = await fetchHtml(page, path);
    assertNoUserState(auth, path, verify.user?.mail ?? null);
  });
});
