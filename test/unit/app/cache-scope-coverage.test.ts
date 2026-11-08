/**
 * 缓存展示面（scope）覆盖守卫。
 *
 * 边缘刷新按「展示面」精确展开（只改正文 = 只刷文章页，省 89% 额度），
 * 但代价是：**漏登记一个展示面 = 那一处会挂满源站 TTL（6 小时）**。
 *
 * 这里用源码字面量守住：任何渲染了文章卡片字段（标题/摘要/封面/评论数/点赞数）的页面，
 * 都必须落在某个已登记的展示面里 —— 新增页面忘了登记，CI 就红。
 */
import { readFileSync } from "node:fs";

import { describe, expect, test } from "bun:test";

import { collectVueFiles, pageRoute, routeMatches } from "#test/helpers/page-route";
import { isCdnCachedPage } from "#shared/cache-routes";

/** 文章卡片上会出现的字段（渲染了它们的页面都会受文章变更影响） */
const CARD_FIELD_PATTERN = /commentsNum|likesCount|like_num|content\.title|content\.desc|content\.covers/;

/** 已登记会显示文章卡片的页面（新增这类页面时要同步登记展示面） */
const CARD_SCOPE_ROUTES = ["/", "/archiving", "/sitemap", "/sitemap.xml"];

/**
 * 显示的是**自己的内容**（订阅文章 / 更新日志 / 友链 / 独立页面）的页面 ——
 * 这些数据不归 contents 表的文章卡片展示面管，各有自己的失效路由。
 */
const OWN_CONTENT_ROUTES = ["/subscribes", "/changelogs", "/links", "/messages", "/agreement"];

/**
 * 只能靠 TTL 收敛、无法精确失效的页面。
 *
 * 搜索页的边缘/源站缓存键含完整 URL（q 进键）⇒ 写库后无法枚举所有 q 去失效，
 * 只能靠短 TTL 收敛（build.searchCacheSeconds）。这里登记它是为了让 CI 守卫看见它，
 * 而不是声称它被精确失效。
 */
const TTL_CONVERGED_ROUTES = ["/search"];

describe("展示面覆盖", () => {
  test("渲染文章卡片字段的页面都在已登记的展示面里", () => {
    const misses: string[] = [];
    for (const file of collectVueFiles("app/pages")) {
      const src = readFileSync(file, "utf8");
      if (!CARD_FIELD_PATTERN.test(src)) continue;
      const route = pageRoute(file);
      // 不进边缘缓存的页（后台/搜索/登录）本就不需要失效
      if (!isCdnCachedPage(route)) continue;
      // 文章详情页显示的是「别的文章的卡片」→ 由 related 展示面反查覆盖
      if (routeMatches(route, "/content/**")) continue;
      // 分类/标签列表页 → 卡片展示面按精确路径清
      if (routeMatches(route, "/category/**") || routeMatches(route, "/tag/**")) continue;
      // 直接由卡片展示面清
      if (CARD_SCOPE_ROUTES.includes(route)) continue;
      // 显示的是自己的内容（订阅文章/日志/友链/独立页）→ 各有自己的失效路由
      if (OWN_CONTENT_ROUTES.includes(route)) continue;
      // 只能靠 TTL 收敛的页面（搜索页：缓存键含 q，无法枚举失效）
      if (TTL_CONVERGED_ROUTES.includes(route)) continue;
      misses.push(`${file}（路由 ${route}）渲染了文章卡片字段但不在任何已登记展示面里`);
    }
    expect(misses).toEqual([]);
  });

  test("评论数/点赞数所在的列表页都在计数类失效路由里", () => {
    const misses: string[] = [];
    for (const file of collectVueFiles("app/pages")) {
      const src = readFileSync(file, "utf8");
      if (!/commentsNum|likesCount|like_num/.test(src)) continue;
      const route = pageRoute(file);
      if (!isCdnCachedPage(route)) continue;
      // 文章详情页的计数是客户端实时拉的（/api/comments 无缓存头）→ 不需要
      if (routeMatches(route, "/content/**")) continue;
      if (routeMatches(route, "/category/**") || routeMatches(route, "/tag/**")) continue;
      // 首页/归档/关于/站点地图各自的计数字段不同，逐一核对
      const known = ["/", "/archiving", "/about", "/sitemap"];
      if (known.includes(route)) continue;
      // 只能靠 TTL 收敛的页面（搜索页：结果里的点赞数跟着 q 进缓存键，无法枚举失效）
      if (TTL_CONVERGED_ROUTES.includes(route)) continue;
      misses.push(`${file}（路由 ${route}）显示了计数但未登记到计数类失效路由`);
    }
    expect(misses).toEqual([]);
  });
});
