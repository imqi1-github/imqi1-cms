<script setup lang="ts">
import { heroStats, quickEntries, recentPhotos, recentPosts } from '@/data/home'
import type { Post } from '@/types/post'

function onPostTap(post: Post) {
  uni.showToast({ title: post.title, icon: 'none', duration: 1200 })
}

function onEntryTap(label: string) {
  uni.showToast({ title: `${label}（占位）`, icon: 'none', duration: 1000 })
}

function onMoreTap(label: string) {
  uni.showToast({ title: `查看全部${label}（占位）`, icon: 'none', duration: 1000 })
}
</script>

<template>
  <view class="page bg-[#ffffff] min-h-screen">
    <!-- ============ HERO ============ -->
    <view class="hero px-32 pt-48 pb-40">
      <view class="mono hero__eyebrow text-[#1d4ed8]">
        <text class="hero__dot" /> // imqi1.com
      </view>

      <view class="hero__title mt-16">
        <text class="text-[#0f172a]">
          IM
        </text><text class="text-[#dc2626]">
          QI1
        </text><text class="text-[#0f172a]">
          .COM
        </text>
      </view>
      <view class="hero__rule" />

      <view class="hero__tagline mt-20 text-[#334155]">
        记录代码、旅行与生活
      </view>
      <view class="mono hero__meta mt-12 text-[#94a3b8]">
        nuxt · typescript · prisma · uni-app
      </view>

      <!-- 数据条 -->
      <view class="hero__stats mt-40">
        <view
          v-for="(s, i) in heroStats"
          :key="s.label"
          class="hero__stat"
          :class="{ 'hero__stat--last': i === heroStats.length - 1 }"
        >
          <view class="hero__stat-value text-[#0f172a]">
            {{ s.value }}
          </view>
          <view class="mono hero__stat-label text-[#94a3b8]">
            {{ s.label }}
          </view>
        </view>
      </view>

      <!-- 快捷入口 -->
      <scroll-view
        scroll-x
        enable-flex
        class="hero__entries mt-40"
      >
        <view
          v-for="entry in quickEntries"
          :key="entry.label"
          class="entry"
          hover-class="entry--active"
          :hover-stay-time="80"
          @tap="onEntryTap(entry.label)"
        >
          <wd-icon
            :name="entry.icon"
            size="32rpx"
            custom-class="text-[#1d4ed8]"
          />
          <text class="entry__label">
            {{ entry.label }}
          </text>
        </view>
      </scroll-view>
    </view>

    <!-- ============ 最新文章 ============ -->
    <view class="section px-32 pt-24">
      <view class="section__head">
        <view class="mono section__eyebrow text-[#1d4ed8]">
          // latest-posts
        </view>
        <view class="section__title text-[#0f172a]">
          最新发布
        </view>
        <view class="section__sub text-[#64748b]">
          生活中的小事、照片，感兴趣的技术
        </view>
      </view>

      <view class="post-list mt-24">
        <view
          v-for="post in recentPosts"
          :key="post.cid"
          class="post"
          hover-class="post--active"
          :hover-stay-time="80"
          @tap="onPostTap(post)"
        >
          <view class="post__cover">
            <wd-img
              :src="post.cover"
              width="100%"
              height="100%"
              mode="aspectFill"
              custom-class="post__img"
            >
              <template #error>
                <view class="post__cover-fallback">
                  <text class="text-[#cbd5e1]">
                    {{ post.title.charAt(0) }}
                  </text>
                </view>
              </template>
            </wd-img>
            <!-- 关联地点角标 -->
            <view
              v-if="post.travelCount && post.travelCount > 0"
              class="post__pin"
            >
              <wd-icon
                name="location"
                size="20rpx"
                custom-class="text-[#ffffff]"
              />
              <text>{{ post.travelCount }}</text>
            </view>
          </view>

          <view class="post__body">
            <view class="post__cat text-[#1d4ed8]">
              <wd-icon
                name="folder"
                size="22rpx"
                custom-class="text-[#1d4ed8]"
              />
              <text>{{ post.category.name }}</text>
            </view>
            <view class="post__title text-[#0f172a]">
              {{ post.title }}
            </view>
            <view class="post__desc text-[#64748b]">
              {{ post.desc }}
            </view>
            <view class="post__meta text-[#94a3b8]">
              <view class="post__meta-item">
                <wd-icon
                  name="clock"
                  size="22rpx"
                />
                <text>{{ post.created }}</text>
              </view>
              <view class="post__meta-item">
                <wd-icon
                  name="chat"
                  size="22rpx"
                />
                <text>{{ post.commentsNum > 0 ? `${post.commentsNum} 评论` : '暂无评论' }}</text>
              </view>
            </view>
          </view>
        </view>
      </view>

      <view
        class="more mt-32"
        hover-class="more--active"
        :hover-stay-time="80"
        @tap="onMoreTap('文章')"
      >
        <text>查看全部文章</text>
        <wd-icon
          name="arrow-right"
          size="24rpx"
        />
      </view>
    </view>

    <!-- ============ 最新图片 ============ -->
    <view class="section px-32 pt-48">
      <view class="section__head">
        <view class="mono section__eyebrow text-[#1d4ed8]">
          // recent-photos
        </view>
        <view class="section__title text-[#0f172a]">
          最新图片
        </view>
        <view class="section__sub text-[#64748b]">
          小物件、风景，值得记录的瞬间
        </view>
      </view>

      <scroll-view
        scroll-x
        enable-flex
        class="photo-scroll mt-24"
      >
        <view
          v-for="photo in recentPhotos"
          :key="photo.id"
          class="photo"
          hover-class="photo--active"
          :hover-stay-time="80"
        >
          <view class="photo__frame">
            <wd-img
              :src="photo.url"
              width="100%"
              height="100%"
              mode="aspectFill"
              custom-class="photo__img"
            />
          </view>
          <text class="photo__cap text-[#64748b]">
            {{ photo.desc }}
          </text>
        </view>
      </scroll-view>
    </view>

    <!-- ============ FOOTER ============ -->
    <view class="footer px-32 pt-64 pb-48">
      <view class="mono footer__line text-[#94a3b8]">
        // built with uni-app · vue3 · unocss
      </view>
      <view class="footer__copy text-[#cbd5e1]">
        © 2026 imqi1
      </view>
    </view>
  </view>
</template>

<style lang="scss">
// 等宽字体栈：mp-weixin 无 Web 字体，用系统 mono 体现「代码博客」气质
.mono {
  font-family: 'SFMono-Regular', Menlo, Consolas, 'Liberation Mono', 'Courier New', monospace;
}

// ---------- HERO ----------
.hero__eyebrow {
  display: flex;
  align-items: center;
  font-size: 24rpx;
  letter-spacing: 0.04em;
}

.hero__dot {
  display: inline-block;
  width: 12rpx;
  height: 12rpx;
  border-radius: 50%;
  background: #dc2626;
  margin-right: 12rpx;
  // 呼吸动画：暗示「在线」
  animation: pulse 2.4s ease-in-out infinite;
}

.hero__title {
  font-weight: 900;
  font-size: 104rpx;
  line-height: 1;
  letter-spacing: -0.02em;
}

.hero__rule {
  width: 64rpx;
  height: 6rpx;
  background: #dc2626;
  border-radius: 3rpx;
  margin-top: 20rpx;
}

.hero__tagline {
  font-size: 30rpx;
  font-weight: 500;
}

.hero__meta {
  font-size: 22rpx;
  letter-spacing: 0.02em;
}

.hero__stats {
  display: flex;
  align-items: stretch;
}

.hero__stat {
  flex: 1;
  padding-right: 24rpx;
  margin-right: 24rpx;
  border-right: 2rpx solid #f1f5f9;

  &--last {
    border-right: none;
    margin-right: 0;
    padding-right: 0;
  }
}

.hero__stat-value {
  font-size: 44rpx;
  font-weight: 800;
  line-height: 1;
}

.hero__stat-label {
  font-size: 22rpx;
  margin-top: 10rpx;
}

.hero__entries {
  // 横向滚动入口：消除滚动条留白
  white-space: nowrap;
}

.entry {
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  flex-shrink: 0;
  width: 120rpx;
  height: 120rpx;
  margin-right: 20rpx;
  background: #f8fafc;
  border: 2rpx solid #f1f5f9;
  border-radius: 20rpx;
  transition: background 0.15s ease;

  &--active {
    background: #eff6ff;
    border-color: #bfdbfe;
  }

  &:last-child {
    margin-right: 32rpx;
  }
}

.entry__label {
  font-size: 22rpx;
  color: #475569;
  margin-top: 12rpx;
}

// ---------- SECTION ----------
.section__eyebrow {
  font-size: 24rpx;
  letter-spacing: 0.04em;
}

.section__title {
  font-size: 44rpx;
  font-weight: 800;
  line-height: 1.2;
  margin-top: 12rpx;
}

.section__sub {
  font-size: 26rpx;
  margin-top: 10rpx;
}

// ---------- 文章卡片 ----------
.post-list {
  display: flex;
  flex-direction: column;
  gap: 28rpx;
}

.post {
  background: #ffffff;
  border: 2rpx solid #f1f5f9;
  border-radius: 24rpx;
  overflow: hidden;
  transition: transform 0.15s ease, border-color 0.15s ease;

  &--active {
    transform: scale(0.985);
    border-color: #dbeafe;
  }
}

.post__cover {
  position: relative;
  width: 100%;
  height: 360rpx;
  background: #f8fafc;
}

.post__img {
  display: block;
}

.post__cover-fallback {
  width: 100%;
  height: 100%;
  display: flex;
  align-items: center;
  justify-content: center;
  font-size: 80rpx;
  font-weight: 800;
}

.post__pin {
  position: absolute;
  top: 20rpx;
  right: 20rpx;
  display: flex;
  align-items: center;
  gap: 6rpx;
  padding: 8rpx 16rpx;
  border-radius: 100rpx;
  background: rgba(15, 23, 42, 0.6);
  color: #ffffff;
  font-size: 22rpx;
  backdrop-filter: blur(8rpx);
}

.post__body {
  padding: 24rpx 28rpx 28rpx;
}

.post__cat {
  display: flex;
  align-items: center;
  gap: 6rpx;
  font-size: 24rpx;
  font-weight: 600;
}

.post__title {
  font-size: 32rpx;
  font-weight: 700;
  line-height: 1.4;
  margin-top: 12rpx;
  // 两行省略
  display: -webkit-box;
  -webkit-box-orient: vertical;
  -webkit-line-clamp: 2;
  overflow: hidden;
}

.post__desc {
  font-size: 26rpx;
  line-height: 1.5;
  margin-top: 10rpx;
  display: -webkit-box;
  -webkit-box-orient: vertical;
  -webkit-line-clamp: 2;
  overflow: hidden;
}

.post__meta {
  display: flex;
  align-items: center;
  gap: 24rpx;
  margin-top: 20rpx;
  font-size: 24rpx;
}

.post__meta-item {
  display: flex;
  align-items: center;
  gap: 6rpx;
}

.more {
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 8rpx;
  height: 88rpx;
  border: 2rpx solid #f1f5f9;
  border-radius: 100rpx;
  font-size: 26rpx;
  color: #1d4ed8;
  transition: background 0.15s ease;

  &--active {
    background: #eff6ff;
  }
}

// ---------- 图片横向滚动 ----------
.photo-scroll {
  white-space: nowrap;
}

.photo {
  display: inline-flex;
  flex-direction: column;
  flex-shrink: 0;
  width: 300rpx;
  margin-right: 20rpx;

  &:last-child {
    margin-right: 32rpx;
  }

  &--active {
    opacity: 0.85;
  }
}

.photo__frame {
  width: 300rpx;
  height: 300rpx;
  border-radius: 20rpx;
  overflow: hidden;
  background: #f8fafc;
}

.photo__cap {
  font-size: 24rpx;
  margin-top: 14rpx;
  text-align: center;
}

// ---------- FOOTER ----------
.footer {
  text-align: center;
}

.footer__line {
  font-size: 22rpx;
}

.footer__copy {
  font-size: 22rpx;
  margin-top: 12rpx;
}

// ---------- 进入动画 ----------
@keyframes pulse {
  0%, 100% { opacity: 1; }
  50% { opacity: 0.3; }
}

@keyframes fadeUp {
  from { opacity: 0; transform: translateY(24rpx); }
  to { opacity: 1; transform: translateY(0); }
}

.hero__eyebrow,
.hero__title,
.hero__rule,
.hero__tagline,
.hero__meta,
.hero__stats,
.hero__entries {
  animation: fadeUp 0.5s ease both;
}
.hero__title { animation-delay: 0.05s; }
.hero__rule { animation-delay: 0.1s; }
.hero__tagline { animation-delay: 0.15s; }
.hero__meta { animation-delay: 0.2s; }
.hero__stats { animation-delay: 0.25s; }
.hero__entries { animation-delay: 0.3s; }
</style>
