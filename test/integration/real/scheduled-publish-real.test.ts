/**
 * 真实 DB 集成测 —— 定时发布 worker + scheduledAt ISO 时刻落库。
 * 回归:前端曾提交 datetime-local 裸串,UTC 容器按本地时区解析,定时发布晚 8 小时。
 * 服务端契约锚定:scheduledAt 传 ISO 绝对时刻 → scheduled_at 原样存储;到点 worker 置 status=1 并清标记。
 */
import { tmpdir } from "node:os";
import { join } from "node:path";

import { describe, expect, test } from "bun:test";

import { setupTestEnv } from "./_setup";

// log.ts 导入时解析 LOGS_DIR(在下方动态 import 服务端模块之前生效)
process.env.LOGS_DIR = join(tmpdir(), `sched-pub-real-${process.pid}`);

const CSRF_TOKEN = "test-csrf-token-1234567890";

await setupTestEnv();
await import("#test/helpers/nitro-globals");
const { getDb, callDbAdmin, loginDbCookie, seedContent } = await import("./_helpers");
const { registerDbReset } = await import("./_helpers");
const putHandler = (await import("#server/api/admin/contents/[cid].put")).default;
const { runScheduledPublish } = await import("#server/utils/scheduled-publish");

describe("定时发布(真实 DB)", () => {
  registerDbReset();

  test("到点草稿 → 置 status=1 + 清 scheduled_at", async () => {
    const post = await seedContent({ title: "定时稿", slug: "sched-past", status: 0 });
    const db = await getDb();
    await db.contents.update({
      where: { cid: post.cid },
      data: { scheduled_at: new Date(Date.now() - 60_000) },
    });

    const r = await runScheduledPublish();
    expect(r.publishedCids).toContain(post.cid);
    const row = await db.contents.findUnique({ where: { cid: post.cid } });
    expect(row!.status).toBe(1);
    expect(row!.scheduled_at).toBeNull();
  });

  test("未到点不发布,行保持草稿", async () => {
    const post = await seedContent({ title: "未来稿", slug: "sched-future", status: 0 });
    const db = await getDb();
    await db.contents.update({
      where: { cid: post.cid },
      data: { scheduled_at: new Date(Date.now() + 3_600_000) },
    });

    const r = await runScheduledPublish();
    expect(r.publishedCids).not.toContain(post.cid);
    const row = await db.contents.findUnique({ where: { cid: post.cid } });
    expect(row!.status).toBe(0);
    expect(row!.scheduled_at).not.toBeNull();
  });

  test("回归:PUT scheduledAt 传 ISO 绝对时刻 → scheduled_at 原样落库(不受服务器时区影响)", async () => {
    const post = await seedContent({ title: "ISO 稿", slug: "sched-iso", status: 0 });
    const iso = "2099-01-02T03:04:05.000Z";
    const cookie = await loginDbCookie();
    const r = await callDbAdmin(putHandler, {
      method: "PUT", url: `/api/admin/contents/${post.cid}`,
      cookie, params: { cid: String(post.cid) },
      body: { csrfToken: CSRF_TOKEN, title: "ISO 稿", content: "x", status: 0, type: 0, scheduledAt: iso },
    }) as unknown as { success: boolean };
    expect(r.success).toBe(true);

    const db = await getDb();
    const row = await db.contents.findUnique({ where: { cid: post.cid } });
    expect(row!.scheduled_at!.toISOString()).toBe(iso);
  });
});
