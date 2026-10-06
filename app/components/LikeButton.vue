<script setup lang="ts">
import { computed, watch } from "vue";

/**
 * 文章点赞按钮。
 *
 * Props 全部 required（无 SSR/CSR 双态机）—— 由 useContentLike 在挂载后注入；
 * 视觉：心形图标 + 数字徽章；激活后心形 pulse + 8 颗 CSS 粒子 burst。
 *
 * 动画纯 CSS（不引第三方）：burstKey 改变时给 burst 容器加 .like-burst--play 类，
 * 动画结束通过 animationend 移除（避免无限叠加 keyframes 拖性能）。
 */

interface Props {
  count: number;
  liked: boolean;
  pending: boolean;
  /** 每次 like 触发 +1；组件 watch 后启动一次 burst 动画 */
  burstKey: number;
}

const props = defineProps<Props>();
const emit = defineEmits<{
  like: [];
}>();

const animating = ref(false);

watch(
  () => props.burstKey,
  () => {
    if (props.burstKey <= 0) return;
    animating.value = false;
    // 下一帧再加类，触发 animationend 重新监听（同一类不重启动画）
    requestAnimationFrame(() => {
      animating.value = true;
    });
  },
);

function onAnimationEnd() {
  animating.value = false;
}

// 数字显示：千以下原样；千以上 1.2k 风格（与评论/阅读量风格统一）
const displayCount = computed(() => {
  const n = props.count;
  if (n < 1000) return String(n);
  if (n < 10000) return `${(n / 1000).toFixed(1).replace(/\.0$/, "")}k`;
  if (n < 1_000_000) return `${Math.floor(n / 1000)}k`;
  return `${(n / 1_000_000).toFixed(1)}m`;
});

function handleClick() {
  if (props.pending || props.liked) return;
  emit("like");
}

// tooltip 文案随状态切换：未点赞提示「点赞」，已点赞提示「已点赞过」，pending 不提示
const tooltipText = computed(() => {
  if (props.pending) return "";
  return props.liked ? "已点赞过" : "给作者点鼓励";
});
</script>

<template>
  <button
    v-tooltip="tooltipText"
    type="button"
    :aria-pressed="liked"
    :disabled="pending"
    :class="[
      'group relative inline-flex items-center gap-1.5 rounded-full border px-3 py-1.5 text-sm font-medium transition-all duration-200 cursor-pointer',
      'focus:outline-none focus-visible:ring-2 focus-visible:ring-rose-400 focus-visible:ring-offset-2',
      'disabled:opacity-60 disabled:cursor-not-allowed',
      liked
        ? 'border-rose-200 bg-rose-50 text-rose-600 hover:bg-rose-100 dark:border-rose-800/50 dark:bg-rose-900/20 dark:text-rose-400'
        : 'border-gray-200 bg-white text-gray-600 hover:border-rose-200 hover:bg-rose-50 hover:text-rose-500 dark:border-gray-700 dark:bg-gray-900 dark:text-gray-400 dark:hover:border-rose-700 dark:hover:bg-rose-900/20 dark:hover:text-rose-400',
    ]"
    @click="handleClick"
  >
    <!-- 心形图标：liked 用 filled，其它 outline；transition 让 fill 切换平滑 -->
    <span
      :class="[
        'relative inline-flex size-4 items-center justify-center transition-transform duration-200',
        liked ? 'like-heart--liked' : '',
      ]"
    >
      <Icon
        :name="liked ? 'lucide:heart' : 'lucide:heart'"
        mode="svg"
        :class="liked ? 'fill-current' : ''"
        class="size-4"
      />
      <span v-if="liked" class="like-heart-pulse" />
    </span>

    <!-- 数字：liked 切换时短暂滑动 -->
    <span class="tabular-nums">{{ displayCount }}</span>

    <!-- burst 粒子层：liked 后从按钮中心向四面迸发 8 颗小爱心 -->
    <span
      v-if="burstKey > 0"
      :key="burstKey"
      :class="['like-burst', animating ? 'like-burst--play' : '']"
      @animationend="onAnimationEnd"
    >
      <span v-for="i in 8" :key="i" :class="`like-burst__p${i}`" />
    </span>
  </button>
</template>

<style scoped>
/* 心形 pulse 环：liked 时一个略大的同色圆环由透明缩放到不透明再消失 */
.like-heart-pulse {
  position: absolute;
  inset: 0;
  border-radius: 9999px;
  background: currentColor;
  opacity: 0;
  animation: like-heart-pulse 0.6s ease-out;
  pointer-events: none;
}

@keyframes like-heart-pulse {
  0% {
    transform: scale(1);
    opacity: 0.35;
  }
  100% {
    transform: scale(2.2);
    opacity: 0;
  }
}

/* burst 容器：absolute 居中，pointer-events none 让点击仍落到按钮 */
.like-burst {
  position: absolute;
  left: 50%;
  top: 50%;
  width: 0;
  height: 0;
  pointer-events: none;
  z-index: 10;
}

.like-burst__p1,
.like-burst__p2,
.like-burst__p3,
.like-burst__p4,
.like-burst__p5,
.like-burst__p6,
.like-burst__p7,
.like-burst__p8 {
  position: absolute;
  left: -3px;
  top: -3px;
  width: 6px;
  height: 6px;
  border-radius: 9999px;
  background: currentColor;
  opacity: 0;
  transform: translate(0, 0);
}

/* 8 个方向用各自 keyframe 角度 + 距离，错峰形成迸发感 */
.like-burst--play .like-burst__p1 { animation: like-burst-1 0.7s cubic-bezier(0.2, 0.6, 0.4, 1) forwards; }
.like-burst--play .like-burst__p2 { animation: like-burst-2 0.7s cubic-bezier(0.2, 0.6, 0.4, 1) forwards; }
.like-burst--play .like-burst__p3 { animation: like-burst-3 0.7s cubic-bezier(0.2, 0.6, 0.4, 1) forwards; }
.like-burst--play .like-burst__p4 { animation: like-burst-4 0.7s cubic-bezier(0.2, 0.6, 0.4, 1) forwards; }
.like-burst--play .like-burst__p5 { animation: like-burst-5 0.7s cubic-bezier(0.2, 0.6, 0.4, 1) forwards; }
.like-burst--play .like-burst__p6 { animation: like-burst-6 0.7s cubic-bezier(0.2, 0.6, 0.4, 1) forwards; }
.like-burst--play .like-burst__p7 { animation: like-burst-7 0.7s cubic-bezier(0.2, 0.6, 0.4, 1) forwards; }
.like-burst--play .like-burst__p8 { animation: like-burst-8 0.7s cubic-bezier(0.2, 0.6, 0.4, 1) forwards; }

@keyframes like-burst-1 { 0% { opacity: 1; } 100% { opacity: 0; transform: translate(-22px, -16px) scale(0.5); } }
@keyframes like-burst-2 { 0% { opacity: 1; } 100% { opacity: 0; transform: translate(0, -22px) scale(0.5); } }
@keyframes like-burst-3 { 0% { opacity: 1; } 100% { opacity: 0; transform: translate(22px, -16px) scale(0.5); } }
@keyframes like-burst-4 { 0% { opacity: 1; } 100% { opacity: 0; transform: translate(-26px, 4px) scale(0.5); } }
@keyframes like-burst-5 { 0% { opacity: 1; } 100% { opacity: 0; transform: translate(26px, 4px) scale(0.5); } }
@keyframes like-burst-6 { 0% { opacity: 1; } 100% { opacity: 0; transform: translate(-22px, 20px) scale(0.5); } }
@keyframes like-burst-7 { 0% { opacity: 1; } 100% { opacity: 0; transform: translate(0, 26px) scale(0.5); } }
@keyframes like-burst-8 { 0% { opacity: 1; } 100% { opacity: 0; transform: translate(22px, 20px) scale(0.5); } }
</style>
