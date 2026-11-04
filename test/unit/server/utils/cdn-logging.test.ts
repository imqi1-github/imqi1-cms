// CDN 刷新的日志：自动刷新与后台手动刷新都走 runCdnPurge，日志口径一致。
import { afterEach, describe, expect, test } from "bun:test";

import { runCdnPurge } from "#server/utils/cdn";
import type { CdnProvider, CdnPurgeResult } from "#server/types/utils/cdn";

const ORIGINAL_LOG = console.log;
const lines: string[] = [];

afterEach(() => {
  console.log = ORIGINAL_LOG;
  lines.length = 0;
});

function captureLog(): void {
  console.log = (...args: unknown[]) => {
    lines.push(args.map(a => String(a)).join(" "));
  };
}

function fakeProvider(result: CdnPurgeResult): CdnProvider {
  return {
    name: "edgeone",
    isEnabled: () => true,
    purgeUrls: async () => result,
    purgeRoutes: async () => result,
  };
}

describe("CDN 刷新日志", () => {
  test("成功：记录 provider/来源/路由/目标数/任务号", async () => {
    captureLog();
    await runCdnPurge(
      fakeProvider({ provider: "edgeone", success: true, requested: 3, taskId: "job-1" }),
      async () => ({ provider: "edgeone", success: true, requested: 3, taskId: "job-1" }),
      { 来源: "自动", 路由: "/content/**,/tag/**" },
    );
    const line = lines.find(l => l.includes("CDN 刷新"));
    expect(line).toBeDefined();
    expect(line).toContain("来源=自动");
    expect(line).toContain("路由=/content/**,/tag/**");
    expect(line).toContain("目标数=3");
    expect(line).toContain("结果=成功");
    expect(line).toContain("任务号=job-1");
  });

  test("失败：错误信息进日志（结果=失败 …）", async () => {
    captureLog();
    const failed: CdnPurgeResult = {
      provider: "edgeone",
      success: false,
      requested: 2,
      error: "LimitExceeded.DailyQuota: 当天提交的资源数超过上限",
    };
    await runCdnPurge(fakeProvider(failed), async () => failed, { 来源: "后台手动", 路由: "(全站)" });
    const line = lines.find(l => l.includes("CDN 刷新"));
    // 含空格的字段值会被日志工具 JSON 引号包住（结果="失败 …"）
    expect(line).toContain("结果=");
    expect(line).toContain("LimitExceeded.DailyQuota");
    expect(line).toContain("来源=后台手动");
  });
});
