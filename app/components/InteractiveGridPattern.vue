<script lang="ts" setup>
import { ref, computed, type HTMLAttributes } from "vue";

import { cn } from "@/lib/utils";

// ✅ Inspira UI - Interactive Grid Pattern
// 来源: https://inspira-ui.com/docs/en/components/backgrounds/interactive-grid-pattern
// 用 SVG 绘制网格，鼠标悬停的格子高亮，纯 CSS 过渡，无第三方依赖（仅用项目内 cn）

const props = withDefaults(defineProps<{
  className?: HTMLAttributes["class"];
  squaresClassName?: HTMLAttributes["class"];
  width?: number;
  height?: number;
  squares?: [number, number];
}>(), {
  width: 40,
  height: 40,
  squares: () => [24, 24],
});

const horizontal = computed(() => props.squares[0]);
const vertical = computed(() => props.squares[1]);

const totalSquares = computed(() => horizontal.value * vertical.value);

const hoveredSquare = ref<number | null>(null);

const gridWidth = computed(() => props.width * horizontal.value);
const gridHeight = computed(() => props.height * vertical.value);

function getX(index: number) {
  return (index % horizontal.value) * props.width;
}

function getY(index: number) {
  return Math.floor(index / horizontal.value) * props.height;
}

const svgClass = computed(() =>
  cn("absolute inset-0 h-full w-full border border-gray-400/30", props.className),
);

function getRectClass(index: number) {
  return cn(
    "stroke-gray-400/30 transition-all duration-100 ease-in-out [&:not(:hover)]:duration-1000",
    hoveredSquare.value === index ? "fill-gray-300/30" : "fill-transparent",
    props.squaresClassName,
  );
}

function handleMouseEnter(index: number) {
  hoveredSquare.value = index;
}

function handleMouseLeave() {
  hoveredSquare.value = null;
}
</script>

<template>
  <svg
    :width.attr="gridWidth"
    :height.attr="gridHeight"
    :class="svgClass"
  >
    <rect
      v-for="(_, index) in totalSquares"
      :key="index"
      :x.attr="getX(index)"
      :y.attr="getY(index)"
      :width.attr="props.width"
      :height.attr="props.height"
      :class="getRectClass(index)"
      @mouseenter="handleMouseEnter(index)"
      @mouseleave="handleMouseLeave"
    />
  </svg>
</template>
