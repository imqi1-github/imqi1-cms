import "#test/helpers/nitro-globals";

import { beforeEach, describe, expect, mock, test } from "bun:test";

import { makeAuthEvent } from "#test/helpers/auth-fakes";
import { mockSharedPrisma, sharedFake } from "#test/helpers/fake-prisma";

mockSharedPrisma();

let fakeDataEnabled = false;
const realMiniFake = await import("#server/utils/mini-fake-data");
mock.module("#server/utils/mini-fake-data", () => ({
  ...realMiniFake,
  isMiniFakeDataEnabled: () => fakeDataEnabled,
}));

// $fetch 桩(repo 代理上游 API)
const g = globalThis as unknown as Record<string, unknown>;
let fetchImpl: (url: string, opts?: unknown) => unknown = async () => ({});
g.$fetch = (url: string, opts?: unknown) => fetchImpl(url, opts);

const contents = [
  { cid: 1, title: "三月文", create_time: new Date("2026-03-15T00:00:00Z") },
  { cid: 2, title: "三月早", create_time: new Date("2026-03-02T00:00:00Z") },
  { cid: 3, title: "一月文", create_time: new Date("2026-01-09T00:00:00Z") },
];
sharedFake.on("contents", "findMany", async () => contents.map(c => ({ ...c })));

const archiveHandler = (await import("#server/api/mini/archive.get")).default;
const repoHandler = (await import("#server/api/mini/repo.get")).default;

function ev(peer: string, url = "/api/mini/x") {
  return makeAuthEvent({ method: "GET", peer, url, headers: { host: "imqi1.com" } }).event;
}

beforeEach(() => {
  fakeDataEnabled = false;
});

describe("mini/archive", () => {
  test("按月分组、组内按时间倒序、day 两位补零", async () => {
    const r = (await archiveHandler(ev("10.9.7.1"))) as unknown as { success: boolean; data: Array<{ title: string; items: Array<{ id: number; day: string }> }> };
    expect(r.success).toBe(true);
    expect(r.data).toHaveLength(2);
    expect(r.data[0]!.title).toBe("2026 年 03 月");
    expect(r.data[0]!.items.map(i => i.id)).toEqual([1, 2]);
    expect(r.data[0]!.items[1]!.day).toBe("02");
    expect(r.data[1]!.title).toBe("2026 年 01 月");
  });

  test("审核模式:只回占位分组", async () => {
    fakeDataEnabled = true;
    const r = (await archiveHandler(ev("10.9.7.2"))) as { data: unknown[] };
    expect(r.data).toHaveLength(1);
  });
});

describe("mini/repo(上游 API 代理)", () => {
  test("参数校验:platform 非法/缺 owner/repo → 400", async () => {
    await expect(repoHandler(ev("10.9.7.3", "/api/mini/repo?platform=gitlab&owner=a&repo=b"))).rejects.toMatchObject({ statusCode: 400 });
    await expect(repoHandler(ev("10.9.7.4", "/api/mini/repo?platform=github&owner=&repo=b"))).rejects.toMatchObject({ statusCode: 400 });
    await expect(repoHandler(ev("10.9.7.5", "/api/mini/repo"))).rejects.toMatchObject({ statusCode: 400 });
  });

  test("github:归一化字段;上游失败 → 500", async () => {
    const seen: Array<{ url: string; opts: unknown }> = [];
    fetchImpl = async (url, opts) => {
      seen.push({ url, opts });
      return { full_name: "imqi1/imqi1-cms", description: "站点", stargazers_count: 12, forks_count: 3, language: "TypeScript", updated_at: "2026-01-01T00:00:00Z" };
    };

    const r = (await repoHandler(ev("10.9.7.6", "/api/mini/repo?platform=github&owner=imqi1&repo=imqi1-cms"))) as unknown as { success: boolean; data: Record<string, unknown> };
    expect(r.success).toBe(true);
    expect(seen[0]!.url).toBe("https://api.github.com/repos/imqi1/imqi1-cms");
    // 拒绝重定向(SSRF 防护) + GitHub 必带 User-Agent
    expect((seen[0]!.opts as { redirect: string }).redirect).toBe("error");
    expect((seen[0]!.opts as { headers: Record<string, string> }).headers["User-Agent"]).toBe("imqi1-mini");

    fetchImpl = async () => {
      throw new Error("upstream down");
    };
    await expect(repoHandler(ev("10.9.7.7", "/api/mini/repo?platform=gitee&owner=a&repo=b"))).rejects.toMatchObject({ statusCode: 502 });
  });
});
