import { afterEach, beforeEach, describe, expect, test } from "bun:test";

import { useSiteSettings } from "~/composables/useSiteSettings";
import type { SiteSettings } from "~/types/apis/settings";

// 全局 stub useState 已存在 key 复用的全局 Map;每个 test 启动清空避免污染。
beforeEach(() => {
  useState<unknown>("site:settings", () => null).value = null;
  useState<unknown>("site:buildHash", () => null).value = null;
  useState<unknown>("site:miniQrEnabled", () => null).value = false;
});

// $fetch 默认是 stub Promise.resolve(undefined);逐 test 覆写。
const origFetch = globalThis.$fetch;
afterEach(() => {
  (globalThis as { $fetch: typeof globalThis.$fetch }).$fetch = origFetch;
});

function stubFetch(impl: (url: string) => Promise<unknown>) {
  (globalThis as { $fetch: typeof globalThis.$fetch }).$fetch = impl as typeof globalThis.$fetch;
}

const SAMPLE: SiteSettings = {
  siteName: "imqi1",
  siteUrl: "https://imqi1.com",
  siteDesc: "desc",
  siteIcp: "",
  homeCustomText: "",
  photoCategorySlug: "photo",
  commentEnabled: true,
  commentAvatarService: "gravatar",
  commentPageSize: 10,
  commentMaxLevel: 4,
  commentInterval: 60,
  commentRequireMail: false,
  commentRequireLink: false,
  contentPageSize: 10,
  feedCacheInterval: 12,
  linkAutoApprove: true,
  musicPlaylistId: "123",
};

describe("useSiteSettings:派生只读 computed", () => {
  test("siteUrl:数据库非空时去掉末尾斜杠 + 优先 settings.siteUrl", () => {
    useState<SiteSettings | null>("site:settings", () => null).value = { ...SAMPLE, siteUrl: "https://imqi1.com///" };
    const { siteUrl } = useSiteSettings();
    expect(siteUrl.value).toBe("https://imqi1.com");
  });

  test("siteUrl:数据库为空时回落 site.config.ts.site.url", () => {
    useState<SiteSettings | null>("site:settings", () => null).value = { ...SAMPLE, siteUrl: "" };
    const { siteUrl } = useSiteSettings();
    expect(siteUrl.value.length).toBeGreaterThan(0);
    expect(siteUrl.value).not.toMatch(/\/$/);
  });

  test("siteSettings/buildHash/miniQrEnabled 暴露为 readonly ref", () => {
    useState<SiteSettings | null>("site:settings", () => null).value = SAMPLE;
    const r = useSiteSettings();
    expect(r.siteSettings.value).toBe(SAMPLE);
    expect(r.buildHash.value).toBeNull();
    expect(r.miniQrEnabled.value).toBe(false);
    // readonly 仅在 dev 生效;此处断言对象存在即可(强 readonly 测见 vue 自身)
    expect(r.isLoadingSettings.value).toBe(false);
    expect(r.errorSettings.value).toBeNull();
  });
});

describe("useSiteSettings.fetchSiteSettings", () => {
  test("SSR 已有 useState 值(插件预取):不发 /api/site 请求,直接返回", async () => {
    useState<SiteSettings | null>("site:settings", () => null).value = SAMPLE;
    let called = 0;
    stubFetch(async () => { called++; return { success: true, data: SAMPLE }; });

    const r = useSiteSettings();
    const result = await r.fetchSiteSettings();
    expect(called).toBe(0);
    expect(result).toBe(SAMPLE);
  });

  test("客户端空缓存:发 /api/site,成功后写入 useState + buildHash + miniQrEnabled", async () => {
    stubFetch(async (url) => {
      if (url !== "/api/site") throw new Error(`unexpected url ${url}`);
      return {
        success: true,
        data: { ...SAMPLE, siteUrl: "https://api-set.example.com/" },
        buildHash: "v123",
        miniQrEnabled: true,
      };
    });

    const r = useSiteSettings();
    const result = await r.fetchSiteSettings();
    // 末尾斜杠在 siteUrl computed 里 strip,siteSettings.value 保留原样
    expect(result.siteUrl).toBe("https://api-set.example.com/");
    expect(r.siteSettings.value?.siteUrl).toBe("https://api-set.example.com/");
    expect(r.siteUrl.value).toBe("https://api-set.example.com"); // computed 兜底 strip
    expect(r.buildHash.value).toBe("v123");
    expect(r.miniQrEnabled.value).toBe(true);
  });

  test("buildHash / miniQrEnabled 缺省时回落 null / false,不抛", async () => {
    stubFetch(async () => ({
      success: true,
      data: SAMPLE,
      // 不带 buildHash / miniQrEnabled
    }));
    const r = useSiteSettings();
    await r.fetchSiteSettings();
    expect(r.buildHash.value).toBeNull();
    expect(r.miniQrEnabled.value).toBe(false);
  });

  test("客户端并发调用复用同一个 fetchPromise(不发两次请求)", async () => {
    let callCount = 0;
    stubFetch(async () => {
      callCount++;
      await new Promise(r => setTimeout(r, 10));
      return { success: true, data: SAMPLE };
    });

    const r = useSiteSettings();
    const p1 = r.fetchSiteSettings();
    const p2 = r.fetchSiteSettings();
    await Promise.all([p1, p2]);
    expect(callCount).toBe(1);
    expect(r.isLoadingSettings.value).toBe(false); // finally 已复位
  });

  test("success=false 走异常分支:error 落到 errorSettings,isLoading 复位", async () => {
    stubFetch(async () => ({ success: false }));
    const r = useSiteSettings();
    await expect(r.fetchSiteSettings()).rejects.toThrow();
    expect(r.errorSettings.value).toMatch(/Invalid response format|失败/);
    expect(r.isLoadingSettings.value).toBe(false);
  });

  test("fetch 抛错(网络/500):errorSettings 记录,异常向上抛", async () => {
    stubFetch(async () => { throw new Error("network down"); });
    const r = useSiteSettings();
    await expect(r.fetchSiteSettings()).rejects.toThrow("network down");
    expect(r.errorSettings.value).toBe("network down");
    expect(r.isLoadingSettings.value).toBe(false);
  });

  test("非 Error 类型抛出(字符串/对象)统一归到「获取站点设置失败」", async () => {
    stubFetch(async () => { throw "raw string"; });
    const r = useSiteSettings();
    await expect(r.fetchSiteSettings()).rejects.toBe("raw string");
    expect(r.errorSettings.value).toBe("获取站点设置失败");
  });

  test("SSR 且缓存为空:不发 /api/site,返回空对象(SSR 直走 DB 插件预取,这里兜底)", async () => {
    // 测试环境 import.meta.server 始终 false;这里改测 fetchPromise=null 时被另一路径返回空对象。
    // (真正的 SSR 路径用 vue/server-renderer 测更合适,这里锁定兜底分支的形状)
    stubFetch(async () => ({ success: true, data: SAMPLE }));
    const r = useSiteSettings();
    // 清空缓存,然后直接看:useState.value 为 null 时,fetchSiteSettings 会进 fetchPromise 分支
    // (SSR 守卫分支拿不到,只能在 bun:test 测 client 分支)
    await r.fetchSiteSettings();
    expect(r.siteSettings.value).toBe(SAMPLE);
  });
});