import { prisma } from "./prisma";
import { invalidateContentCaches } from "./content-cache";
import { log } from "./log";

import { CONTENT_CACHE_ROUTES } from "#shared/constants";

/**
 * 定时发布 worker：从 contents 表扫「scheduled_at <= now 且 status=0」的行，置 status=1。
 *
 * 单次扫描 = 一个 transaction：保证「同一时刻多条都发布」的原子性。
 * ISR 缓存失效放在事务外（best-effort，失败不阻塞发布）。
 *
 * 返回值便于上层做监控/单测断言：
 *   - publishedCids: 本次发布的文章 cid 列表（按 scheduled_at 升序，保证「早到点的先发」）
 */
export interface ScheduledPublishResult {
  publishedCids: number[];
  scannedAt: Date;
}

export async function runScheduledPublish(now: Date = new Date()): Promise<ScheduledPublishResult> {
  const due = await prisma.contents.findMany({
    where: {
      type: 0, // 仅文章定时发布，页面独立页不强语义
      status: 0, // 仅草稿
      scheduled_at: { lte: now, not: null },
    },
    select: { cid: true, scheduled_at: true },
    orderBy: { scheduled_at: "asc" },
  });

  if (due.length === 0) {
    return { publishedCids: [], scannedAt: now };
  }

  log.cron("publish.batch", { count: due.length, cids: due.map(d => d.cid).join(",") });

  const cids = due.map(item => item.cid);

  await prisma.$transaction(
    cids.map(cid =>
      prisma.contents.update({
        where: { cid },
        data: {
          status: 1,
          scheduled_at: null, // 清掉定时标记，避免下次再扫中
          update_time: now,
        },
      }),
    ),
  );

  // 失效 ISR 缓存：发布影响首页/分类/标签/详情/归档/站点地图，与 article CRUD 一致
  void invalidateContentCaches({ routes: CONTENT_CACHE_ROUTES }).catch(err =>
    console.error("[cache] 定时发布失效缓存失败", err),
  );

  return { publishedCids: cids, scannedAt: now };
}