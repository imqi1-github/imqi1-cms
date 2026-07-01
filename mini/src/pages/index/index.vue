<script setup lang="ts">
import { articles } from '@/data/home'
import type { ArticleCard } from '@/types/post'
import TheTabBar from '@/components/TheTabBar.vue'

// 死数据阶段：仅 UI 预览，点击给出反馈，后续接真实路由
const goArticle = (a: ArticleCard) => {
  uni.showToast({ title: `预览：${a.title}`, icon: 'none' })
}
const todo = (label: string) => {
  uni.showToast({ title: `${label}（开发中）`, icon: 'none' })
}
</script>

<template>
  <view class="page">
    <!-- 英雄区：蓝色渐变卡片 -->
    <view class="hero">
      <view class="hero__glow" />
      <view class="hero__bar">
        <view class="brand">
          <view class="brand__dot" />
          <text class="brand__name">
            imqi1
          </text>
        </view>
      </view>

      <text class="hero__eyebrow">
        BLOG
      </text>
      <view class="hero__title">
        记录代码，<br>也记录生活。
      </view>
      <text class="hero__sub">
        技术笔记、城市漫步、随手拍，偶尔写点没用的东西。
      </text>

      <view class="hero__actions">
        <wd-button
          type="primary"
          size="medium"
          custom-style="background-color:#ffffff;color:#2563eb;border:none"
          @click="todo('浏览文章')"
        >
          浏览文章
        </wd-button>
        <wd-button
          type="primary"
          size="medium"
          custom-style="background-color:rgba(255,255,255,0.14);color:#ffffff;border:1px solid rgba(255,255,255,0.55)"
          @click="todo('关于')"
        >
          关于
        </wd-button>
      </view>
    </view>

    <!-- 最近发布 -->
    <view class="section">
      <view class="section__head">
        <view class="section__title">
          <text class="section__name">
            最近发布的文章
          </text>
        </view>
        <view
          class="section__more"
          @tap="todo('查看全部')"
        >
          <text>查看全部</text>
          <wd-icon
            name="arrow-right"
            size="28rpx"
          />
        </view>
      </view>

      <view class="grid">
        <view
          v-for="a in articles"
          :key="a.id"
          class="card"
          @tap="goArticle(a)"
        >
          <view class="card__cover">
            <wd-img
              :src="a.cover"
              width="100%"
              height="200rpx"
              mode="aspectFill"
            />
          </view>
          <view class="card__body">
            <text class="card__title">
              {{ a.title }}
            </text>
            <view class="card__meta">
              <wd-icon
                name="clock"
                size="22rpx"
              />
              <text class="card__time">
                {{ a.publishedAt }}
              </text>
            </view>
          </view>
        </view>
      </view>

      <view class="end">
        <view class="end__line" />
        <text class="end__text">
          已经到底啦
        </text>
        <view class="end__line" />
      </view>
    </view>

    <TheTabBar active="index" />
  </view>
</template>

<style lang="scss" scoped>
.page {
  min-height: 100vh;
  background: var(--bg);
}

/* ===== 英雄区 ===== */
.hero {
  position: relative;
  overflow: hidden;
  margin: 24rpx 24rpx 0;
  padding: 40rpx 36rpx 44rpx;
  border-radius: 28rpx;
  background: linear-gradient(135deg, #4f8cff 0%, #2563eb 100%);
  box-shadow: 0 16rpx 40rpx rgb(37 99 235 / 28%);
  color: #fff;
}

/* 装饰光晕 */
.hero__glow {
  position: absolute;
  top: -120rpx;
  right: -80rpx;
  width: 320rpx;
  height: 320rpx;
  border-radius: 50%;
  background: radial-gradient(circle, rgb(255 255 255 / 22%) 0%, rgb(255 255 255) 70%);
  pointer-events: none;
}

.hero__bar {
  position: relative;
  display: flex;
  align-items: center;
  justify-content: space-between;
}

.brand {
  display: flex;
  align-items: center;
}

.brand__dot {
  width: 16rpx;
  height: 16rpx;
  border-radius: 50%;
  background: #fff;
  margin-right: 14rpx;
}

.brand__name {
  font-size: 32rpx;
  font-weight: 700;
  letter-spacing: 0.04em;
  color: #fff;
}

.hero__eyebrow {
  position: relative;
  display: block;
  margin-top: 56rpx;
  font-size: 22rpx;
  font-weight: 600;
  letter-spacing: 0.4em;
  color: rgb(255 255 255 / 85%);
}

.hero__title {
  position: relative;
  margin-top: 20rpx;
  font-size: 60rpx;
  font-weight: 800;
  line-height: 1.28;
  letter-spacing: -0.01em;
  color: #fff;
}

.hero__sub {
  position: relative;
  display: block;
  margin-top: 24rpx;
  font-size: 26rpx;
  line-height: 1.7;
  color: rgb(255 255 255 / 82%);
}

.hero__actions {
  position: relative;
  display: flex;
  gap: 24rpx;
  margin-top: 48rpx;
}

/* ===== 最近发布 ===== */
.section {
  padding: 48rpx 24rpx 64rpx;
}

.section__head {
  display: flex;
  align-items: flex-end;
  justify-content: space-between;
  margin-bottom: 32rpx;
  padding: 0 16rpx;
}

.section__title {
  display: flex;
  align-items: baseline;
}

.section__name {
  font-size: 36rpx;
  font-weight: 800;
  letter-spacing: 0.02em;
  color: var(--ink);
}

.section__more {
  display: flex;
  align-items: center;
  font-size: 24rpx;
  color: var(--brand);

  text {
    margin-right: 6rpx;
  }
}

/* ===== 卡片网格 ===== */
.grid {
  display: grid;
  grid-template-columns: repeat(2, 1fr);
  gap: 24rpx;
}

.card {
  background: var(--card);
  border-radius: 20rpx;
  overflow: hidden;
  box-shadow: 0 8rpx 24rpx rgb(15 23 42 / 6%);
}

.card__cover {
  background: var(--line);
}

.card__body {
  padding: 20rpx 22rpx 24rpx;
}

.card__title {
  display: -webkit-box;
  -webkit-box-orient: vertical;
  -webkit-line-clamp: 2;
  overflow: hidden;
  font-size: 27rpx;
  font-weight: 600;
  line-height: 1.45;
  color: var(--ink);
  /* 单行标题也占满两行高度，保证卡片底对齐 */
  min-height: 78rpx;
}

.card__meta {
  display: flex;
  align-items: center;
  margin-top: 14rpx;
  color: var(--muted);
}

.card__time {
  margin-left: 8rpx;
  font-size: 22rpx;
}

/* ===== 底部 ===== */
.end {
  display: flex;
  align-items: center;
  justify-content: center;
  margin-top: 56rpx;
}

.end__line {
  width: 64rpx;
  height: 2rpx;
  background: var(--line);
}

.end__text {
  margin: 0 20rpx;
  font-size: 22rpx;
  letter-spacing: 0.15em;
  color: var(--muted);
}
</style>
