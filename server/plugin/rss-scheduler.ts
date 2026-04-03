import { updateAllSubscribes } from '../utils/rss';

let updateTimer: NodeJS.Timeout | null = null;
const UPDATE_INTERVAL = 8 * 60 * 60 * 1000; // 8小时

// 启动定时任务
function startScheduler() {
  if (updateTimer) {
    return;
  }

  // 立即执行一次更新（延迟1分钟，避免启动时负载过高）
  setTimeout(async () => {
    try {
      console.log('[RSS订阅] 开始自动更新订阅...');
      const result = await updateAllSubscribes();
      console.log(`[RSS订阅] 自动更新完成: 成功 ${result.success}/${result.total}`);
    } catch (error) {
      console.error('[RSS订阅] 自动更新失败:', error);
    }
  }, 60 * 1000);

  // 设置定时任务
  updateTimer = setInterval(async () => {
    try {
      console.log('[RSS订阅] 开始自动更新订阅...');
      const result = await updateAllSubscribes();
      console.log(`[RSS订阅] 自动更新完成: 成功 ${result.success}/${result.total}`);
    } catch (error) {
      console.error('[RSS订阅] 自动更新失败:', error);
    }
  }, UPDATE_INTERVAL);

  console.log('[RSS订阅] 定时任务已启动，更新间隔: 8小时');
}

// Nitro plugin
export default defineNitroPlugin(() => {
  startScheduler();
});
