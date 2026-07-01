<script setup lang="ts">
import TheTabBar from '@/components/TheTabBar.vue'

// 死数据阶段：占位页面，后续接入真实分类数据
</script>

<template>
  <view class="page">
    <view class="empty">
      <view class="empty__icon">
        <wd-icon
          name="list"
          size="88rpx"
        />
      </view>
      <text class="empty__title">
        分类
      </text>
      <text class="empty__hint">
        功能开发中，敬请期待
      </text>
    </view>

    <TheTabBar active="category" />
  </view>
</template>

<style lang="scss" scoped>
.page {
  min-height: 100vh;
  background: var(--bg);
  display: flex;
  align-items: center;
  justify-content: center;
  padding: 48rpx;
}

.empty {
  display: flex;
  flex-direction: column;
  align-items: center;
  text-align: center;
}

.empty__icon {
  display: flex;
  align-items: center;
  justify-content: center;
  width: 160rpx;
  height: 160rpx;
  margin-bottom: 36rpx;
  border-radius: 50%;
  background: var(--card);
  color: var(--brand);
  box-shadow: 0 8rpx 24rpx rgb(15 23 42 / 6%);
}

.empty__title {
  font-size: 36rpx;
  font-weight: 800;
  letter-spacing: 0.02em;
  color: var(--ink);
}

.empty__hint {
  margin-top: 12rpx;
  font-size: 26rpx;
  color: var(--muted);
}
</style>
