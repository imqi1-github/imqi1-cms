import { describe, expect, test } from "bun:test";

import {
  ADMIN_DASHBOARD_TAKE,
  ADMIN_PAGE_SIZE_MAX,
  ADMIN_PAGE_SIZE_MIN,
  ADMIN_PAGE_SIZE_PRESETS,
  CHANGELOG_MAX_BYTES,
  COMMENT_CACHE_ROUTES,
  COMMENT_LOAD_ALL_PAGE_SIZE,
  CONTENT_CACHE_ROUTES,
  CONTENT_DETAIL_CACHE_ROUTES,
  CONTENT_PAGE_SIZE_DEFAULT,
  CONTENT_PAGE_SIZE_MAX,
  CSRF_HEADER,
  CSRF_TOKEN_ENDPOINT,
  CATEGORY_CACHE_ROUTES,
  CHANGELOG_CACHE_ROUTES,
  DEFAULT_COMMENT_AVATAR_SERVICE,
  DEFAULT_COMMENT_INTERVAL,
  DEFAULT_COMMENT_MAX_LEVEL,
  DEFAULT_COMMENT_PAGE_SIZE,
  DEFAULT_FEED_CACHE_INTERVAL,
  DEFAULT_SEARCH_CACHE_EXPIRE,
  DEFAULT_SESSION_STORE_TYPE,
  DEFAULT_SMTP_PORT,
  DEFAULT_UPLOAD_LOCATION,
  LINKS_CACHE_ROUTES,
  MAX_ATTACHMENT_BYTES,
  MAX_COMMENT_LENGTH,
  MAX_LIVE_PHOTO_BYTES,
  PAGE_MAX,
  PRISMA_NOT_FOUND_CODE,
  PUBLIC_CACHE_CONTROL,
  PUBLIC_CACHE_CONTROL_SHORT,
  PUBLIC_LIMIT_MAX,
  SEARCH_RESULT_TAKE,
  SUBSCRIBE_CACHE_ROUTES,
  TAG_CACHE_ROUTES,
  TRAVEL_CACHE_ROUTES,
  UNBOUNDED_TAKE_FALLBACK,
  clampAdminPageSize,
} from "#shared/constants";

describe("分页上下限", () => {
  test("PAGE_MAX 是 10000,防止超大 skip", () => {
    expect(PAGE_MAX).toBe(10000);
  });

  test("CONTENT_PAGE_SIZE 上限 50,默认 12", () => {
    expect(CONTENT_PAGE_SIZE_MAX).toBe(50);
    expect(CONTENT_PAGE_SIZE_DEFAULT).toBe(12);
    expect(CONTENT_PAGE_SIZE_DEFAULT).toBeLessThanOrEqual(CONTENT_PAGE_SIZE_MAX);
  });

  test("COMMENT_LOAD_ALL_PAGE_SIZE = 10000(前后端共用)", () => {
    expect(COMMENT_LOAD_ALL_PAGE_SIZE).toBe(10000);
  });

  test("ADMIN_PAGE_SIZE 上下限与预设档位一致", () => {
    expect(ADMIN_PAGE_SIZE_MIN).toBe(1);
    expect(ADMIN_PAGE_SIZE_MAX).toBe(1000);
    expect(ADMIN_PAGE_SIZE_PRESETS).toEqual([10, 20, 50]);
    // 预设档都落在 [MIN, MAX] 内
    for (const p of ADMIN_PAGE_SIZE_PRESETS) {
      expect(p).toBeGreaterThanOrEqual(ADMIN_PAGE_SIZE_MIN);
      expect(p).toBeLessThanOrEqual(ADMIN_PAGE_SIZE_MAX);
    }
  });

  test("PUBLIC_LIMIT_MAX = 100", () => {
    expect(PUBLIC_LIMIT_MAX).toBe(100);
  });
});

describe("clampAdminPageSize", () => {
  test("合法数字原样返回", () => {
    expect(clampAdminPageSize(50)).toBe(50);
  });

  test("超过上限钳到 ADMIN_PAGE_SIZE_MAX", () => {
    expect(clampAdminPageSize(99999)).toBe(ADMIN_PAGE_SIZE_MAX);
    expect(clampAdminPageSize(1001)).toBe(ADMIN_PAGE_SIZE_MAX);
  });

  test("小于下限回退 fallback(而非 1,避免空输入只剩一条)", () => {
    expect(clampAdminPageSize(0)).toBe(10);
    expect(clampAdminPageSize(-5)).toBe(10);
  });

  test("NaN / undefined / 非数字回退 fallback", () => {
    expect(clampAdminPageSize(NaN)).toBe(10);
    expect(clampAdminPageSize(undefined)).toBe(10);
    expect(clampAdminPageSize(null)).toBe(10);
    expect(clampAdminPageSize("abc")).toBe(10);
    expect(clampAdminPageSize({})).toBe(10);
  });

  test("字符串数字走 Number 转换", () => {
    expect(clampAdminPageSize("25")).toBe(25);
    expect(clampAdminPageSize("99.9")).toBe(99); // Math.floor
    expect(clampAdminPageSize("3.7")).toBe(3);
  });

  test("可定制 fallback", () => {
    expect(clampAdminPageSize(NaN, 50)).toBe(50);
    expect(clampAdminPageSize(-1, 20)).toBe(20);
  });

  test("边界值:正好等于上下限不变", () => {
    expect(clampAdminPageSize(ADMIN_PAGE_SIZE_MIN)).toBe(ADMIN_PAGE_SIZE_MIN);
    expect(clampAdminPageSize(ADMIN_PAGE_SIZE_MAX)).toBe(ADMIN_PAGE_SIZE_MAX);
  });
});

describe("站点设置默认值(三张默认值表共用)", () => {
  test("头像服务默认 gravatar", () => {
    expect(DEFAULT_COMMENT_AVATAR_SERVICE).toBe("gravatar");
  });

  test("评论每页/最大层级/发布间隔", () => {
    expect(DEFAULT_COMMENT_PAGE_SIZE).toBe(10);
    expect(DEFAULT_COMMENT_MAX_LEVEL).toBe(4);
    expect(DEFAULT_COMMENT_INTERVAL).toBe(60);
  });

  test("订阅源缓存 / 搜索缓存 / SMTP / 上传位置 / 会话存储", () => {
    expect(DEFAULT_FEED_CACHE_INTERVAL).toBe(8);
    expect(DEFAULT_SEARCH_CACHE_EXPIRE).toBe(300);
    expect(DEFAULT_SMTP_PORT).toBe(465);
    expect(DEFAULT_UPLOAD_LOCATION).toBe("local");
    expect(DEFAULT_SESSION_STORE_TYPE).toBe("memory");
  });
});

describe("长度与大小上限", () => {
  test("附件 10MB / 实况照 50MB", () => {
    expect(MAX_ATTACHMENT_BYTES).toBe(10 * 1024 * 1024);
    expect(MAX_LIVE_PHOTO_BYTES).toBe(50 * 1024 * 1024);
    expect(MAX_LIVE_PHOTO_BYTES).toBeGreaterThan(MAX_ATTACHMENT_BYTES);
  });

  test("评论内容上限 5000", () => {
    expect(MAX_COMMENT_LENGTH).toBe(5000);
  });

  test("CHANGELOG_MAX_BYTES = 65535(单条 64K 内)", () => {
    expect(CHANGELOG_MAX_BYTES).toBe(65535);
  });

  test("搜索结果 / 仪表盘 / 无界兜底", () => {
    expect(SEARCH_RESULT_TAKE).toBe(50);
    expect(ADMIN_DASHBOARD_TAKE).toBe(5);
    expect(UNBOUNDED_TAKE_FALLBACK).toBe(2000);
  });
});

describe("CSRF / 错误码常量", () => {
  test("CSRF 端点路径与 header 名", () => {
    expect(CSRF_TOKEN_ENDPOINT).toBe("/api/csrf/token");
    expect(CSRF_HEADER).toBe("x-csrf-token");
  });

  test("PRISMA_NOT_FOUND_CODE = P2025", () => {
    expect(PRISMA_NOT_FOUND_CODE).toBe("P2025");
  });
});

describe("公开接口缓存头", () => {
  test("含 s-maxage 的 5 分钟 CDN 缓存", () => {
    expect(PUBLIC_CACHE_CONTROL).toBe("public, max-age=300, s-maxage=300");
    expect(PUBLIC_CACHE_CONTROL).toContain("s-maxage");
  });

  test("不带 s-maxage 的浏览器直接缓存版", () => {
    expect(PUBLIC_CACHE_CONTROL_SHORT).toBe("public, max-age=300");
    expect(PUBLIC_CACHE_CONTROL_SHORT).not.toContain("s-maxage");
  });
});

describe("ISR 缓存失效路由集(改了数据 → 影响哪些前台页)", () => {
  test("LINKS 改 → /links + /map(博客网络含友链)", () => {
    expect(LINKS_CACHE_ROUTES).toEqual(["/links", "/map"]);
  });

  test("SUBSCRIBE 改 → 首页 + 订阅页 + /map", () => {
    expect(SUBSCRIBE_CACHE_ROUTES).toEqual(["/", "/subscribes", "/map"]);
  });

  test("CHANGELOG 改 → 首页 + changelogs 页", () => {
    expect(CHANGELOG_CACHE_ROUTES).toEqual(["/", "/changelogs"]);
  });

  test("COMMENT 改 → 首页 + 列表 + 详情 + 归档(评论数会变)", () => {
    expect(COMMENT_CACHE_ROUTES).toEqual([
      "/",
      "/category/**",
      "/tag/**",
      "/content/**",
      "/archiving",
    ]);
  });

  test("CONTENT 改 → 比 COMMENT 多一个 /sitemap", () => {
    expect(CONTENT_CACHE_ROUTES).toEqual([
      "/",
      "/category/**",
      "/tag/**",
      "/archiving",
      "/content/**",
      "/sitemap",
    ]);
    // 改动比 COMMENT 多的:归档与 sitemap
    expect(CONTENT_CACHE_ROUTES.length).toBeGreaterThan(COMMENT_CACHE_ROUTES.length);
  });

  test("CATEGORY 改 → 不含 /tag/**(标签不受影响)", () => {
    expect(CATEGORY_CACHE_ROUTES).toEqual([
      "/",
      "/category/**",
      "/content/**",
      "/archiving",
      "/sitemap",
    ]);
    expect(CATEGORY_CACHE_ROUTES).not.toContain("/tag/**");
  });

  test("TAG 改 → 含 /tag/** + sitemap,不含 /category/**", () => {
    expect(TAG_CACHE_ROUTES).toEqual([
      "/",
      "/tag/**",
      "/content/**",
      "/archiving",
      "/sitemap",
    ]);
    expect(TAG_CACHE_ROUTES).not.toContain("/category/**");
  });

  test("TRAVEL 改 → 首页 + /map + /about", () => {
    expect(TRAVEL_CACHE_ROUTES).toEqual(["/", "/map", "/about"]);
  });

  test("附件/用户资料只影响文章详情页", () => {
    expect(CONTENT_DETAIL_CACHE_ROUTES).toEqual(["/content/**"]);
  });

  test("9 组 ISR 路由集齐(原文逐一手抄,改一处漏一处风险)", () => {
    const sets = {
      LINKS_CACHE_ROUTES,
      SUBSCRIBE_CACHE_ROUTES,
      CHANGELOG_CACHE_ROUTES,
      COMMENT_CACHE_ROUTES,
      CONTENT_CACHE_ROUTES,
      CATEGORY_CACHE_ROUTES,
      TAG_CACHE_ROUTES,
      TRAVEL_CACHE_ROUTES,
      CONTENT_DETAIL_CACHE_ROUTES,
    };
    expect(Object.keys(sets)).toHaveLength(9);
  });

  test("所有路由都是非空字符串,根路由 / 在多数集中", () => {
    const sets = {
      LINKS_CACHE_ROUTES,
      SUBSCRIBE_CACHE_ROUTES,
      CHANGELOG_CACHE_ROUTES,
      COMMENT_CACHE_ROUTES,
      CONTENT_CACHE_ROUTES,
      CATEGORY_CACHE_ROUTES,
      TAG_CACHE_ROUTES,
      TRAVEL_CACHE_ROUTES,
      CONTENT_DETAIL_CACHE_ROUTES,
    };
    for (const set of Object.values(sets)) {
      expect(Array.isArray(set)).toBe(true);
      for (const route of set) {
        expect(typeof route).toBe("string");
        expect(route.length).toBeGreaterThan(0);
      }
    }
    for (const [name, set] of Object.entries(sets)) {
      // LINKS 只影响友链页+地图页;CONTENT_DETAIL 只影响文章详情页
      if (name === "LINKS_CACHE_ROUTES" || name === "CONTENT_DETAIL_CACHE_ROUTES") continue;
      expect(set).toContain("/");
    }
  });
});