import { updateAllSubscribes } from '../utils/rss';
import { prisma } from '#server/utils/prisma';

let updateTimer: NodeJS.Timeout | null = null;
const STARTUP_DELAY = 60 * 60 * 1000; // 1小时
const DEFAULT_UPDATE_INTERVAL = 8;

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
    await runUpdate();
    const interval = await getUpdateInterval();
    scheduleNextUpdate(interval * 60 * 60 * 1000);
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
