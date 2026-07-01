<script setup lang="ts">
import { blogInfo, contactInfo, copyright, techStack } from '@/data/about'
import type { AboutInfo } from '@/types/about'
import TheTabBar from '@/components/TheTabBar.vue'

// 点击可复制条目：复制值到剪贴板
function onItem(item: AboutInfo) {
  if (item.action !== 'copy') return
  uni.setClipboardData({
    data: item.value,
    success: () => uni.showToast({ title: `已复制${item.label}`, icon: 'none' }),
  })
}
</script>

<template>
  <view class="page">
    <!-- 标题 -->
    <view class="title-bar">
      <text class="title-bar__text">
        关于
      </text>
    </view>

    <!-- 博客信息 -->
    <view class="section">
      <view class="section__head">
        <text class="section__name">
          博客信息
        </text>
      </view>
      <view class="card">
        <view
          v-for="(item, i) in blogInfo"
          :key="item.label"
          class="row"
          :class="{ 'row--clickable': item.action === 'copy', 'row--last': i === blogInfo.length - 1 }"
          @tap="onItem(item)"
        >
          <view class="row__icon">
            <wd-icon
              :name="item.icon"
              size="34rpx"
            />
          </view>
          <text class="row__label">
            {{ item.label }}
          </text>
          <text class="row__value">
            {{ item.value }}
          </text>
          <view
            v-if="item.action === 'copy'"
            class="row__chevron"
          >
            <wd-icon
              name="arrow-right"
              size="28rpx"
            />
          </view>
        </view>
      </view>
    </view>

    <!-- 联系方式 -->
    <view class="section">
      <view class="section__head">
        <text class="section__name">
          联系方式
        </text>
      </view>
      <view class="card">
        <view
          v-for="item in contactInfo"
          :key="item.label"
          class="row row--last row--clickable"
          @tap="onItem(item)"
        >
          <view class="row__icon">
            <wd-icon
              :name="item.icon"
              size="34rpx"
            />
          </view>
          <text class="row__label">
            {{ item.label }}
          </text>
          <text class="row__value">
            {{ item.value }}
          </text>
          <view class="row__chevron">
            <wd-icon
              name="arrow-right"
              size="28rpx"
            />
          </view>
        </view>
      </view>
    </view>

    <!-- 技术栈 -->
    <view class="section">
      <view class="section__head">
        <text class="section__name">
          技术栈
        </text>
      </view>
      <view class="card tech">
        <view class="tech__chips">
          <view
            v-for="t in techStack"
            :key="t"
            class="tech__chip"
          >
            {{ t }}
          </view>
        </view>
      </view>
    </view>

    <!-- 版权 -->
    <view class="footer">
      <text class="footer__text">
        {{ copyright }}
      </text>
    </view>

    <TheTabBar active="about" />
  </view>
</template>

<style lang="scss" scoped>
.page {
  min-height: 100vh;
  background: var(--bg);
}

/* ===== 标题 ===== */
.title-bar {
  padding: 40rpx 40rpx 8rpx;
}

.title-bar__text {
  font-size: 56rpx;
  font-weight: 800;
  letter-spacing: 0.02em;
  color: var(--ink);
}

/* ===== 通用 section ===== */
.section {
  padding: 40rpx 24rpx 0;
}

.section__head {
  margin-bottom: 24rpx;
  padding: 0 16rpx;
}

.section__name {
  font-size: 36rpx;
  font-weight: 800;
  letter-spacing: 0.02em;
  color: var(--ink);
}

/* ===== 信息卡片 / 行 ===== */
.card {
  background: var(--card);
  border-radius: 20rpx;
  box-shadow: 0 8rpx 24rpx rgb(15 23 42 / 6%);
  overflow: hidden;
}

.row {
  display: flex;
  align-items: center;
  padding: 26rpx 28rpx;
}

.row:not(.row--last) {
  border-bottom: 1rpx solid var(--line);
}

.row--clickable {
  &:active {
    background: var(--line);
  }
}

.row__icon {
  display: flex;
  align-items: center;
  justify-content: center;
  width: 56rpx;
  height: 56rpx;
  margin-right: 20rpx;
  border-radius: 14rpx;
  background: var(--line);
  color: var(--brand);
  flex-shrink: 0;
}

.row__label {
  font-size: 28rpx;
  color: var(--muted);
}

.row__value {
  flex: 1;
  margin-left: 16rpx;
  font-size: 28rpx;
  font-weight: 500;
  color: var(--ink);
  text-align: right;
}

.row__chevron {
  margin-left: 12rpx;
  color: var(--muted);
  flex-shrink: 0;
}

/* ===== 技术栈 ===== */
.tech {
  padding: 28rpx 28rpx 32rpx;
}

.tech__chips {
  display: flex;
  flex-wrap: wrap;
  gap: 16rpx;
}

.tech__chip {
  padding: 10rpx 22rpx;
  border-radius: 10rpx;
  background: var(--line);
  font-size: 24rpx;
  color: var(--ink);
}

/* ===== 版权 ===== */
.footer {
  padding: 56rpx 24rpx 32rpx;
  text-align: center;
}

.footer__text {
  font-size: 22rpx;
  letter-spacing: 0.08em;
  color: var(--muted);
}
</style>
