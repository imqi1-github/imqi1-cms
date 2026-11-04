// EdgeOne 刷新实现：请求体字段、Type 分流、分批、错误映射。
// 官方文档：https://cloud.tencent.com/document/api/1552/80703
import { afterAll, beforeEach, describe, expect, test } from "bun:test";

import { EdgeOneCdnProvider, resetCdnQuotaCache } from "#server/utils/cdn/edgeone";

interface Captured {
  url: string;
  action: string;
  payload: Record<string, unknown>;
}

const ORIGINAL_FETCH = globalThis.fetch;
const captured: Captured[] = [];
let responseBody: unknown = { Response: { JobId: "job-1", RequestId: "req-1" } };
let responseStatus = 200;
/** 额度接口的返回（默认无配额信息 → provider 不做额度预检） */
let quotaBody: unknown = { Response: { PurgeQuota: [] } };

globalThis.fetch = (async (url: string | URL, init?: RequestInit) => {
  const headers = (init?.headers ?? {}) as Record<string, string>;
  const action = headers["X-TC-Action"] ?? "";
  captured.push({
    url: String(url),
    action,
    payload: JSON.parse(String(init?.body ?? "{}")) as Record<string, unknown>,
  });
  const body = action === "DescribeContentQuota" ? quotaBody : responseBody;
  return new Response(JSON.stringify(body), {
    status: responseStatus,
    headers: { "Content-Type": "application/json" },
  });
}) as typeof globalThis.fetch;

afterAll(() => {
  globalThis.fetch = ORIGINAL_FETCH;
});

beforeEach(() => {
  captured.length = 0;
  responseStatus = 200;
  responseBody = { Response: { JobId: "job-1", RequestId: "req-1" } };
  quotaBody = { Response: { PurgeQuota: [] } };
  resetCdnQuotaCache();
});

/** 只取刷新任务（刷新前会先查一次额度） */
function purgeTasks(): Captured[] {
  return captured.filter(c => c.action === "CreatePurgeTask");
}

function makeProvider(batchSize?: number) {
  return new EdgeOneCdnProvider(
    {
      zoneId: "zone-test",
      secretId: "AKIDtest",
      secretKey: "key",
      ...(batchSize ? { batchSize } : {}),
    },
    { baseUrl: "https://imqi1.com" },
  );
}

describe("EdgeOneCdnProvider", () => {
  test("缺 ZoneId 或密钥时未启用", () => {
    const noZone = new EdgeOneCdnProvider({ zoneId: "", secretId: "a", secretKey: "b" });
    expect(noZone.isEnabled()).toBe(false);
    const noKey = new EdgeOneCdnProvider({ zoneId: "zone-x", secretId: "", secretKey: "" });
    expect(noKey.isEnabled()).toBe(false);
    expect(makeProvider().isEnabled()).toBe(true);
  });

  test("未启用时刷新直接失败并给出原因，不发请求", async () => {
    const provider = new EdgeOneCdnProvider({ zoneId: "", secretId: "", secretKey: "" });
    const result = await provider.purgeUrls(["https://imqi1.com/"]);
    expect(result.success).toBe(false);
    expect(result.error).toContain("未配置");
    expect(captured.length).toBe(0);
  });

  test("URL 刷新：Type=purge_url，Targets 带协议", async () => {
    const result = await makeProvider().purgeUrls(["https://imqi1.com/", "https://imqi1.com/about"]);
    expect(result.success).toBe(true);
    expect(result.requested).toBe(2);
    expect(result.taskId).toBe("job-1");
    const tasks = captured.filter(c => c.action === "CreatePurgeTask");
    expect(tasks.length).toBe(1);
    expect(tasks[0]!.action).toBe("CreatePurgeTask");
    expect(purgeTasks()[0]!.payload).toEqual({
      ZoneId: "zone-test",
      Type: "purge_url",
      Targets: ["https://imqi1.com/", "https://imqi1.com/about"],
    });
  });

  test("目录刷新：Type=purge_prefix", async () => {
    await makeProvider().purgeDirectories(["https://imqi1.com/content/"]);
    expect(purgeTasks()[0]!.payload.Type).toBe("purge_prefix");
    expect(purgeTasks()[0]!.payload.Targets).toEqual(["https://imqi1.com/content/"]);
  });

  test("主机刷新：Type=purge_host（只写主机名）", async () => {
    await makeProvider().purgeHosts(["imqi1.com"]);
    expect(purgeTasks()[0]!.payload.Type).toBe("purge_host");
    expect(purgeTasks()[0]!.payload.Targets).toEqual(["imqi1.com"]);
  });

  test("按路由刷新：精确页走 URL，通配页走目录前缀", async () => {
    const result = await makeProvider().purgeRoutes(["/", "/content/**"]);
    expect(result.success).toBe(true);
    expect(result.requested).toBe(2);
    expect(purgeTasks().length).toBe(2);
    expect(purgeTasks()[0]!.payload.Type).toBe("purge_url");
    expect(purgeTasks()[0]!.payload.Targets).toEqual(["https://imqi1.com/"]);
    expect(purgeTasks()[1]!.payload.Type).toBe("purge_prefix");
    expect(purgeTasks()[1]!.payload.Targets).toEqual(["https://imqi1.com/content/"]);
  });

  test("空路由列表 → 根目录前缀（全站页面）", async () => {
    await makeProvider().purgeRoutes([]);
    expect(purgeTasks().length).toBe(1);
    expect(purgeTasks()[0]!.payload.Type).toBe("purge_prefix");
    expect(purgeTasks()[0]!.payload.Targets).toEqual(["https://imqi1.com/"]);
  });

  test("超出单次配额自动分批", async () => {
    const urls = ["https://imqi1.com/a", "https://imqi1.com/b", "https://imqi1.com/c"];
    const result = await makeProvider(2).purgeUrls(urls);
    expect(purgeTasks().length).toBe(2);
    expect((purgeTasks()[0]!.payload.Targets as string[]).length).toBe(2);
    expect((purgeTasks()[1]!.payload.Targets as string[]).length).toBe(1);
    expect(result.success).toBe(true);
    expect(result.requested).toBe(3);
  });

  test("接口返回 Error 时判失败并带出错误码", async () => {
    responseBody = { Response: { Error: { Code: "LimitExceeded.BatchQuota", Message: "超出配额" } } };
    const result = await makeProvider().purgeUrls(["https://imqi1.com/"]);
    expect(result.success).toBe(false);
    expect(result.error).toContain("LimitExceeded.BatchQuota");
  });

  test("FailedList 里有失败目标时判失败", async () => {
    responseBody = {
      Response: {
        JobId: "job-2",
        FailedList: [{ Reason: "InvalidParameter.Target", Targets: ["https://imqi1.com/x"] }],
      },
    };
    const result = await makeProvider().purgeUrls(["https://imqi1.com/x"]);
    expect(result.success).toBe(false);
    expect(result.error).toContain("InvalidParameter.Target");
    expect(result.taskId).toBe("job-2");
  });

  test("整站刷新：purge_all 不带 Targets", async () => {
    await makeProvider().purgeAll();
    expect(purgeTasks()[0]!.payload.Type).toBe("purge_all");
    expect(purgeTasks()[0]!.payload.Targets).toBeUndefined();
  });
});

describe("EdgeOne 刷新额度（套餐按天计，单位是资源条目数）", () => {
  test("额度不足时不提交任务，并给出可读原因", async () => {
    quotaBody = {
      Response: {
        PurgeQuota: [
          { Type: "purge_url", Batch: 500, Daily: 1000, DailyAvailable: 1 },
          { Type: "purge_prefix", Batch: 50, Daily: 50, DailyAvailable: 0 },
        ],
      },
    };
    const result = await makeProvider().purgeUrls(["https://imqi1.com/a", "https://imqi1.com/b"]);
    expect(result.success).toBe(false);
    expect(result.error).toContain("额度不足");
    expect(purgeTasks().length).toBe(0);
  });

  test("单次提交上限按套餐的 Batch 走（不写死 50）", async () => {
    quotaBody = {
      Response: {
        PurgeQuota: [{ Type: "purge_url", Batch: 2, Daily: 1000, DailyAvailable: 1000 }],
      },
    };
    const urls = ["https://imqi1.com/a", "https://imqi1.com/b", "https://imqi1.com/c"];
    await makeProvider().purgeUrls(urls);
    expect(purgeTasks().length).toBe(2);
    expect((purgeTasks()[0]!.payload.Targets as string[]).length).toBe(2);
    expect((purgeTasks()[1]!.payload.Targets as string[]).length).toBe(1);
  });

  test("目录刷新与 Host 刷新共用同一个额度池", async () => {
    quotaBody = {
      Response: {
        PurgeQuota: [
          { Type: "purge_url", Batch: 500, Daily: 1000, DailyAvailable: 1000 },
          { Type: "purge_prefix", Batch: 50, Daily: 50, DailyAvailable: 50 },
        ],
      },
    };
    const result = await makeProvider().purgeDirectories(["https://imqi1.com/content/"]);
    expect(result.success).toBe(true);
    expect(purgeTasks()[0]!.payload.Type).toBe("purge_prefix");
  });
});

describe("刷新范围（CDN_PURGE_SCOPE）", () => {
  test("scope=site 时所有路由合并成根目录一条（省额度、多回源）", async () => {
    const provider = new EdgeOneCdnProvider(
      { zoneId: "zone-test", secretId: "AKIDtest", secretKey: "key" },
      { baseUrl: "https://imqi1.com", purgeScope: "site" },
    );
    await provider.purgeRoutes(["/", "/content/**", "/archiving"]);
    expect(purgeTasks().length).toBe(1);
    expect(purgeTasks()[0]!.payload.Type).toBe("purge_prefix");
    expect(purgeTasks()[0]!.payload.Targets).toEqual(["https://imqi1.com/"]);
  });

  test("scope=route（默认）时精确页给 URL、通配页给目录", async () => {
    await makeProvider().purgeRoutes(["/", "/content/**"]);
    expect(purgeTasks().length).toBe(2);
    expect(purgeTasks()[0]!.payload.Type).toBe("purge_url");
    expect(purgeTasks()[1]!.payload.Type).toBe("purge_prefix");
  });
});
