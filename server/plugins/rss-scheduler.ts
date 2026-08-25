import { updateAllSubscribes } from '../utils/rss';

import { prisma } from '#server/utils/prisma';

let updateTimer: NodeJS.Timeout | null = null;
const STARTUP_DELAY = 60 * 60 * 1000; // 1小时
const DEFAULT_UPDATE_INTERVAL = 8;

// setTimeout 最大可接受延迟为 2^31-1 ms（约 24.8 天），超过会立刻触发。
// 以 23 天为上限钳制，防止 DB 中异常大的 interval 值让定时器失效。
const MAX_UPDATE_DELAY_MS = 23 * 24 * 60 * 60 * 1000;

function updateDelayMs(intervalHours: number): number {
  return Math.min(MAX_UPDATE_DELAY_MS, intervalHours * 60 * 60 * 1000);
}

async function getUpdateInterval() {
  const setting = await prisma.informations.findFirst({
    where: { key: 'feedCacheInterval' },
    select: { value: true },
  });
  const interval = Number(setting?.value ?? DEFAULT_UPDATE_INTERVAL);
  return Number.isFinite(interval) && interval > 0 ? interval : DEFAULT_UPDATE_INTERVAL;
}

async function runUpdate() {
  try {
    console.log('[RSS订阅] 开始自动更新订阅...');
    const result = await updateAllSubscribes();
    console.log(`[RSS订阅] 自动更新完成: 成功 ${result.success}/${result.total}`);
  } catch (error) {
    console.error(error);
  }
}

function scheduleNextUpdate(delay: number) {
  updateTimer = setTimeout(async () => {
    try {
      await runUpdate();
      const interval = await getUpdateInterval();
      scheduleNextUpdate(updateDelayMs(interval));
    } catch (error) {
      // 任何一步出错都不让调度器死掉：回退到默认间隔，保证后续仍能重试
      console.error('[RSS订阅] 自动更新调度异常，重置为默认间隔', error);
      scheduleNextUpdate(updateDelayMs(DEFAULT_UPDATE_INTERVAL));
    }
  }, delay);
}

// 启动定时任务
function startScheduler() {
  if (updateTimer) {
    return;
  }

  scheduleNextUpdate(STARTUP_DELAY);
  console.log('[RSS订阅] 定时任务已启动，服务器启动1小时后首次更新，随后按数据库设置间隔更新');
}

// Nitro plugin
export default defineNitroPlugin(() => {
  startScheduler();
});
