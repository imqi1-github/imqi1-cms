<script setup lang="ts">
import { categories } from '@/data/category'
import type { CategoryItem } from '@/types/category'
import TheTabBar from '@/components/TheTabBar.vue'

// 死数据阶段：仅 UI 预览，点击给出反馈，后续接真实分类路由
function goCategory(item: CategoryItem) {
  uni.showToast({ title: `预览：${item.title}`, icon: 'none' })
}
</script>

<template>
  <view class="page">
    <!-- 标题 -->
    <view class="title-bar">
      <text class="title-bar__text">
        分类
      </text>
      <text class="title-bar__sub">
        共 4 个分类
      </text>
    </view>

    <!-- 分类列表 -->
    <view class="category-list">
      <view
        v-for="item in categories"
        :key="item.id"
        class="category-card"
        @tap="goCategory(item)"
      >
        <view class="category-card__mark">
          {{ item.mark }}
        </view>
        <view class="category-card__body">
          <view class="category-card__head">
            <text class="category-card__title">
              {{ item.title }}
            </text>
            <text class="category-card__count">
              {{ item.count }} 篇
            </text>
          </view>
          <text class="category-card__desc">
            {{ item.description }}
          </text>
        </view>
      </view>
    </view>

    <TheTabBar active="category" />
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

/* ===== 分类列表 ===== */
.category-list {
  padding: 40rpx 24rpx 0;
}

.category-card {
  display: flex;
  align-items: center;
  margin-bottom: 24rpx;
  padding: 28rpx;
  border-radius: 22rpx;
  background: var(--card);
  box-shadow: 0 8rpx 24rpx rgb(15 23 42 / 6%);
  color: var(--muted);

  &:active {
    background: var(--line);
  }
}

.category-card__mark {
  display: flex;
  align-items: center;
  justify-content: center;
  width: 104rpx;
  height: 104rpx;
  margin-right: 24rpx;
  border-radius: 24rpx;
  background: linear-gradient(135deg, #4f8cff 0%, #2563eb 100%);
  box-shadow: 0 10rpx 22rpx rgb(37 99 235 / 22%);
  flex-shrink: 0;
  font-size: 22rpx;
  font-weight: 800;
  letter-spacing: 0.04em;
  color: #fff;
}

.category-card__body {
  flex: 1;
  min-width: 0;
}

.category-card__head {
  display: flex;
  align-items: center;
  justify-content: space-between;
}

.category-card__title {
  overflow: hidden;
  font-size: 32rpx;
  font-weight: 800;
  color: var(--ink);
  text-overflow: ellipsis;
  white-space: nowrap;
}

.category-card__count {
  margin-left: 16rpx;
  flex-shrink: 0;
  font-size: 23rpx;
  color: var(--brand);
}

.category-card__desc {
  display: block;
  overflow: hidden;
  margin-top: 12rpx;
  font-size: 24rpx;
  line-height: 1.5;
  color: var(--muted);
  text-overflow: ellipsis;
  white-space: nowrap;
}
</style>
