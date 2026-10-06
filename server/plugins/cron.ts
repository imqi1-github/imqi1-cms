/**
 * 定时任务插件：进程内 setInterval 驱动「定时发布」扫描器。
 *
 * 设计取舍：
 *   - 单实例进程内：单用户站点无水平扩展需求，进程内 setInterval 足够；
 *     横向扩容会变成「每实例都扫、都发」重复执行（N 条幂等发布 = 同一份 ISR 失效）。
 *     如未来上多实例应迁到外部 cron（systemd timer / k8s CronJob），扫描函数本身保持单测可验。
 *   - 启动单次 + 周期扫描：避免每分钟空轮询；首次扫描延后 5s 让 nitro 完全初始化。
 *   - 默认 60s：定时发布对精度要求不高（人眼分钟级），60s 已足够；site.config 想调短可改 SCAN_INTERVAL_MS。
 *   - HMR 重载会重复注册：buntest/tsx watch 不挂这个 plugin（plugin 只在 nuxt/nitro build/dev 起动时加载），
 *     但保险仍是模块级 single-flight 模式 — 第二次进入 import 直接复用上一份 timer 引用。
 */

import { runScheduledPublish } from "#server/utils/scheduled-publish";
import { log } from "#server/utils/log";

const SCAN_INTERVAL_MS = 60_000; // 默认 60s 扫一次
const FIRST_SCAN_DELAY_MS = 5_000; // 启动后 5s 首扫

let timer: ReturnType<typeof setInterval> | null = null;
let firstScanTimer: ReturnType<typeof setTimeout> | null = null;
let lastRunAt: number | null = null;
let lastPublishedCount: number | null = null;

export function getScheduledPublishStatus() {
  return {
    intervalMs: SCAN_INTERVAL_MS,
    lastRunAt,
    lastPublishedCount,
  };
}

export default defineNitroPlugin(nitroApp => {
  // 单进程内 single-flight：避免 HMR / 多次启动叠加多份 timer
  if (timer) {
    clearInterval(timer);
    timer = null;
  }
  if (firstScanTimer) {
    clearTimeout(firstScanTimer);
    firstScanTimer = null;
  }

  async function tick() {
    try {
      const r = await runScheduledPublish();
      lastRunAt = Date.now();
      lastPublishedCount = r.publishedCids.length;
      log.cron("tick", {
        scanned: r.publishedCids.length,
        published: r.publishedCids.length > 0 ? r.publishedCids.join(",") : undefined,
      });
    } catch (error) {
      lastRunAt = Date.now();
      lastPublishedCount = 0;
      log.cron("tick.error", { error: error instanceof Error ? error.message : String(error) });
    }
  }

  // 启动后延后首扫（nitro plugin 已可用 + DB 已连）；之后每 SCAN_INTERVAL_MS 一次
  firstScanTimer = setTimeout(() => {
    tick();
    timer = setInterval(tick, SCAN_INTERVAL_MS);
  }, FIRST_SCAN_DELAY_MS);

  // 进程退出时清理：避免重启时上一份 timer 还活着造成泄漏
  nitroApp.hooks.hook("close", () => {
    if (timer) clearInterval(timer);
    if (firstScanTimer) clearTimeout(firstScanTimer);
    timer = null;
    firstScanTimer = null;
  });
});