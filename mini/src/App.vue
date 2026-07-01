<script setup lang="ts">
import { onHide, onLaunch, onShow } from '@dcloudio/uni-app'

onLaunch(() => {
  // 小程序启动
})
onShow(() => {
  // 切入前台
})
onHide(() => {
  // 切入后台
})
</script>

<style lang="scss">
/* 全局样式：每个页面公共 css */
page {
  /* wot-design-uni 主题色覆盖：现代蓝 */
  --wot-color-theme: #3b82f6;

  /* 现代设计 token */
  --bg: #f5f7fa; /* 冷调浅灰页面底 */
  --ink: #0f172a; /* 近黑正文 */
  --muted: #94a3b8; /* 次要文字 */
  --line: #eef1f6; /* 分割线 / 封面占位底 */
  --brand: #3b82f6; /* 主蓝 */
  --brand-2: #2563eb; /* 深蓝（渐变终点） */
  --card: #ffffff;

  background-color: var(--bg);
  color: var(--ink);
}
</style>
