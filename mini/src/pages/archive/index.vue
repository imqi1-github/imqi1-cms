<script setup lang="ts">
import { archiveGroups } from '@/data/archive'
import type { ArchiveArticle } from '@/types/archive'
import TheTabBar from '@/components/TheTabBar.vue'

// 死数据阶段：仅 UI 预览，点击给出反馈，后续接真实文章路由
function goArticle(item: ArchiveArticle) {
  uni.showToast({ title: `预览：${item.title}`, icon: 'none' })
}
</script>

<template>
  <view class="page">
    <!-- 标题 -->
    <view class="title-bar">
      <text class="title-bar__text">
        归档
      </text>
      <text class="title-bar__sub">
        最近 12 篇文章
      </text>
    </view>

    <!-- 时间线 -->
    <view class="timeline">
      <view
        v-for="group in archiveGroups"
        :key="group.title"
        class="month"
      >
        <view class="month__head">
          <view class="month__dot" />
          <text class="month__title">
            {{ group.title }}
          </text>
          <text class="month__count">
            {{ group.items.length }} 篇
          </text>
        </view>

        <view class="month__body">
          <view
            v-for="(item, i) in group.items"
            :key="item.id"
            class="article"
            :class="{ 'article--last': i === group.items.length - 1 }"
            @tap="goArticle(item)"
          >
            <view class="article__day">
              {{ item.day }}
            </view>
            <view class="article__content">
              <text class="article__title">
                {{ item.title }}
              </text>
              <wd-icon
                name="arrow-right"
                size="28rpx"
              />
            </view>
          </view>
        </view>
      </view>
    </view>

    <TheTabBar active="archive" />
  </view>
</template>

<style lang="scss" scoped>
.page {
  min-height: 100vh;
  background: var(--bg);
}

/* ===== 标题 ===== */
.title-bar {
  display: flex;
  align-items: flex-end;
  justify-content: space-between;
  padding: 40rpx 40rpx 8rpx;
}

.title-bar__text {
  font-size: 56rpx;
  font-weight: 800;
  letter-spacing: 0.02em;
  color: var(--ink);
}

.title-bar__sub {
  padding-bottom: 10rpx;
  font-size: 24rpx;
  color: var(--muted);
}

/* ===== 时间线 ===== */
.timeline {
  padding: 40rpx 24rpx 0;
}

.month {
  position: relative;
  margin-bottom: 36rpx;
}

.month::before {
  content: '';
  position: absolute;
  top: 34rpx;
  bottom: -36rpx;
  left: 31rpx;
  width: 3rpx;
  background: rgb(59 130 246 / 24%);
}

.month:last-child::before {
  bottom: 0;
}

.month__head {
  position: relative;
  z-index: 1;
  display: flex;
  align-items: center;
  padding: 0 16rpx 20rpx;
}

.month__dot {
  width: 18rpx;
  height: 18rpx;
  margin-right: 22rpx;
  border: 8rpx solid rgb(59 130 246 / 16%);
  border-radius: 50%;
  background: var(--brand);
  background-clip: content-box;
}

.month__title {
  flex: 1;
  font-size: 34rpx;
  font-weight: 800;
  letter-spacing: 0.02em;
  color: var(--ink);
}

.month__count {
  font-size: 23rpx;
  color: var(--muted);
}

.month__body {
  position: relative;
  z-index: 1;
  margin-left: 64rpx;
  overflow: hidden;
  border-radius: 22rpx;
  background: var(--card);
  box-shadow: 0 8rpx 24rpx rgb(15 23 42 / 6%);
}

.article {
  display: flex;
  align-items: center;
  padding: 28rpx 28rpx 28rpx 24rpx;

  &:active {
    background: var(--line);
  }
}

.article:not(.article--last) {
  border-bottom: 1rpx solid var(--line);
}

.article__day {
  width: 72rpx;
  flex-shrink: 0;
  font-size: 38rpx;
  font-weight: 800;
  line-height: 1;
  color: var(--brand);
  text-align: center;
}

.article__content {
  display: flex;
  align-items: center;
  flex: 1;
  min-width: 0;
  margin-left: 22rpx;
  color: var(--muted);
}

.article__title {
  flex: 1;
  overflow: hidden;
  font-size: 29rpx;
  font-weight: 600;
  line-height: 1.45;
  color: var(--ink);
  text-overflow: ellipsis;
  white-space: nowrap;
}
</style>
