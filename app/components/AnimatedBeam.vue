<template>
  <svg
    fill="none"
    :width="svgDimensions.width"
    :height="svgDimensions.height"
    xmlns="http://www.w3.org/2000/svg"
    :class="cn('pointer-events-none absolute left-0 top-0 overflow-visible transform-gpu stroke-2', $props.class)"
    :viewBox="`0 0 ${svgDimensions.width} ${svgDimensions.height}`">
    <path :d="pathD" :stroke="pathColor" :stroke-width="pathWidth" :stroke-opacity="pathOpacity" stroke-linecap="round" />
    <path :d="pathD" :stroke-width="pathWidth" :stroke="`url(#${id})`" stroke-opacity="1" stroke-linecap="round" />
    <defs>
      <linearGradient :id="id" gradientUnits="userSpaceOnUse" x1="0%" x2="0%" y1="0%" y2="0%">
        <stop :stop-color="gradientStartColor" stop-opacity="0" />
        <stop :stop-color="gradientStartColor" />
        <stop offset="32.5%" :stop-color="gradientStopColor" />
        <stop offset="100%" :stop-color="gradientStopColor" stop-opacity="0" />
        <animate
          v-if="!isVertical"
          attributeName="x1"
          :values="x1"
          :dur="`${duration}s`"
          keyTimes="0; 1"
          keySplines="0.16 1 0.3 1"
          calcMode="spline"
          repeatCount="indefinite" />
        <animate
          v-if="!isVertical"
          attributeName="x2"
          :values="x2"
          :dur="`${duration}s`"
          keyTimes="0; 1"
          keySplines="0.16 1 0.3 1"
          calcMode="spline"
          repeatCount="indefinite" />
        <animate
          v-if="isVertical"
          attributeName="y1"
          :values="y1"
          :dur="`${duration}s`"
          keyTimes="0; 1"
          keySplines="0.16 1 0.3 1"
          calcMode="spline"
          repeatCount="indefinite" />
        <animate
          v-if="isVertical"
          attributeName="y2"
          :values="y2"
          :dur="`${duration}s`"
          keyTimes="0; 1"
          keySplines="0.16 1 0.3 1"
          calcMode="spline"
          repeatCount="indefinite" />
      </linearGradient>
    </defs>
  </svg>
</template>

<script lang="ts" setup>
import { computed, onBeforeUnmount, ref, useId, watchEffect } from "vue";

import { cn } from "~/lib/utils";

const props = withDefaults(defineProps<{
  class?: string;
  containerRef: HTMLElement | null;
  fromRef: HTMLElement | null;
  toRef: HTMLElement | null;
  curvature?: number;
  reverse?: boolean;
  pathColor?: string;
  pathWidth?: number;
  pathOpacity?: number;
  gradientStartColor?: string;
  gradientStopColor?: string;
  duration?: number;
  startXOffset?: number;
  startYOffset?: number;
  endXOffset?: number;
  endYOffset?: number;
}>(), {
  curvature: 0,
  reverse: false,
  // 固定默认值（非 Math.random）：随机默认会让 SSR/客户端首帧 duration 不一致 → 水合属性 mismatch
  duration: 5,
  pathColor: "gray",
  pathWidth: 2,
  pathOpacity: 0.2,
  gradientStartColor: "#3b82f6",
  gradientStopColor: "#8b5cf6",
  startXOffset: 0,
  startYOffset: 0,
  endXOffset: 0,
  endYOffset: 0,
});

// useId() 保证 SSR 与客户端首帧 id 一致； sanitize 防 url(#id) 引用出现非法字符
const id = "beam-" + useId().replace(/[^a-zA-Z0-9_-]/g, "-");

const isVertical = ref(false);
const isRightToLeft = ref(false);
const isBottomToTop = ref(false);

const x1 = computed(() => {
  const direction = props.reverse ? !isRightToLeft.value : isRightToLeft.value;
  return direction ? "90%; -10%;" : "10%; 110%;";
});
const x2 = computed(() => {
  const direction = props.reverse ? !isRightToLeft.value : isRightToLeft.value;
  return direction ? "100%; 0%;" : "0%; 100%;";
});
const y1 = computed(() => {
  const direction = props.reverse ? !isBottomToTop.value : isBottomToTop.value;
  return direction ? "90%; -10%;" : "10%; 110%;";
});
const y2 = computed(() => {
  const direction = props.reverse ? !isBottomToTop.value : isBottomToTop.value;
  return direction ? "100%; 0%;" : "0%; 100%;";
});

const pathD = ref("");
const svgDimensions = ref<{ width: number; height: number }>({ width: 0, height: 0 });

let resizeObserver: ResizeObserver | undefined;

// 根据两端元素相对容器中心的位置计算二次贝塞尔路径
function updatePath() {
  if (props.containerRef && props.fromRef && props.toRef) {
    const containerRect = props.containerRef.getBoundingClientRect();
    const rectA = props.fromRef.getBoundingClientRect();
    const rectB = props.toRef.getBoundingClientRect();

    const svgWidth = containerRect.width;
    const svgHeight = containerRect.height;
    svgDimensions.value = { width: svgWidth, height: svgHeight };

    const startX = rectA.left - containerRect.left + rectA.width / 2 + (props.startXOffset ?? 0);
    const startY = rectA.top - containerRect.top + rectA.height / 2 + (props.startYOffset ?? 0);
    const endX = rectB.left - containerRect.left + rectB.width / 2 + (props.endXOffset ?? 0);
    const endY = rectB.top - containerRect.top + rectB.height / 2 + (props.endYOffset ?? 0);

    // 纵向（Y 距离 > X 距离）时切换为 y 方向的渐变动画
    isVertical.value = Math.abs(endY - startY) > Math.abs(endX - startX);
    isRightToLeft.value = endX < startX;
    isBottomToTop.value = endY < startY;

    const controlY = startY - (props.curvature ?? 0);
    pathD.value = `M ${startX},${startY} Q ${(startX + endX) / 2},${controlY} ${endX},${endY}`;
  }
}

// 三个 ref 全部就绪后挂载一次 ResizeObserver，并在任一变化时重算路径
// （父级 template ref 在子组件 mount 之后才赋值，故不可像上游那样首次 effect 即 stopEffect）
watchEffect(() => {
  if (props.containerRef && props.fromRef && props.toRef) {
    if (!resizeObserver) {
      resizeObserver = new ResizeObserver(() => updatePath());
      resizeObserver.observe(props.containerRef);
    }
    updatePath();
  }
});

onBeforeUnmount(() => {
  resizeObserver?.disconnect();
});
</script>
