import net from "node:net";

import { expect, test } from "@playwright/test";

import { ADMIN_SKIP_MSG, loginAdmin, getAdminSettings } from "../_admin";
import { loadDotEnv } from "../_env";

// 第三方服务冒烟:轻量只读探活,验「配置还活着」(key 有效/桶在/配额没超),不产生业务数据
// 常规 test:e2e 不跑本目录(仅 E2E_SMOKE=1 时收集);人工低频执行: bun run test:e2e:smoke
const env = loadDotEnv();

test.describe("第三方服务冒烟", () => {
  test("COS:桶域名可达(403=存在拒匿名)", async () => {
    test.skip(!env.COS_BUCKET || !env.COS_REGION, "COS_BUCKET/COS_REGION 未配置");
    const res = await fetch(`https://${env.COS_BUCKET}.cos.${env.COS_REGION}.myqcloud.com`);
    // 桶存在:私有 403 / 公有读 200;404 = 桶名或区域配置错
    expect(res.status).not.toBe(404);
    expect(res.status).toBeLessThan(500);
  });

  test("高德:proxy key 有效", async ({ request }) => {
    // 代理挂站点根 /_AMapService(server/routes 无 /api 前缀),catch-all 转发 restapi
    const res = await request.get("/_AMapService/v3/ip");
    // dev 未配 AMAP_KEY/SECURITY_CODE 时代理返 503(fail-closed)
    test.skip(res.status() === 503, "AMAP_KEY 未配置");
    if (res.status() === 404) {
      const body = await res.text();
      test.skip(body.includes("disabled"), "AMap server proxy 未启用(amapUseServerProxy)");
    }
    expect(res.status()).toBe(200);
    const json = (await res.json()) as { info?: string };
    expect(json?.info).not.toBe("INVALID_USER_KEY");
  });

  test("百度内容审核:凭证可换 token", async ({ request }) => {
    test.skip(!(await loginAdmin(request)), ADMIN_SKIP_MSG);
    const settings = await getAdminSettings(request);
    const key = settings.baiduApiKey as string | undefined;
    const secret = settings.baiduSecretKey as string | undefined;
    test.skip(!key || !secret, "百度审核未配置(后台 settings 为空)");

    const res = await fetch(
      `https://aip.baidubce.com/oauth/2.0/token?grant_type=client_credentials&client_id=${key}&client_secret=${secret}`,
      { method: "POST" },
    );
    expect(res.status).toBe(200);
    const json = (await res.json()) as { access_token?: string };
    expect(json?.access_token).toBeTruthy();
  });

  test("SMTP:主机 TCP 可达(220 banner)", async ({ request }) => {
    test.skip(!(await loginAdmin(request)), ADMIN_SKIP_MSG);
    const settings = await getAdminSettings(request);
    const host = settings.smtpHost as string | undefined;
    test.skip(!host, "SMTP 未配置");
    const port = Number(settings.smtpPort) || 587;

    const banner = await new Promise<string>((resolve, reject) => {
      const sock = net.connect({ host: host!, port, timeout: 8000 });
      sock.once("data", (d) => {
        sock.destroy();
        resolve(d.toString());
      });
      sock.once("timeout", () => {
        sock.destroy();
        reject(new Error("connect timeout"));
      });
      sock.once("error", reject);
    });
    expect(banner.startsWith("220")).toBe(true);
  });

  test("GitHub API:可达且有限流余量", async () => {
    const res = await fetch("https://api.github.com/rate_limit", {
      headers: { "User-Agent": "imqi1-cms-smoke" },
    });
    expect(res.status).toBe(200);
    const json = (await res.json()) as { resources?: { core?: { remaining?: number } } };
    expect(json?.resources?.core?.remaining ?? 0).toBeGreaterThan(0);
  });

  test("微信小程序:token 可换", async () => {
    // token 获取受小程序 IP 白名单约束,本机直调常误报,默认跳过
    test.skip(!process.env.E2E_SMOKE_WECHAT, "设 E2E_SMOKE_WECHAT=1 启用(需本机 IP 在小程序白名单)");
    test.skip(!env.WECHAT_MINI_APPID || !env.WECHAT_MINI_SECRET, "小程序凭证未配置");

    const res = await fetch(
      `https://api.weixin.qq.com/cgi-bin/token?grant_type=client_credential&appid=${env.WECHAT_MINI_APPID}&secret=${env.WECHAT_MINI_SECRET}`,
    );
    expect(res.status).toBe(200);
    const json = (await res.json()) as { access_token?: string; errcode?: number };
    expect(json?.access_token).toBeTruthy();
  });
});
