<script setup lang="ts">
const siteName = ref("ImQi1");

useHead({
  title: computed(() => `我的订阅 - ${siteName.value}`)
});

const posts = ref<any[]>([]);
const loading = ref(true);
const error = ref<string | null>(null);

// 加载订阅文章
async function loadPosts() {
  loading.value = true;
  error.value = null;
  try {
    const response = await $fetch('/api/subscribes') as any;
    posts.value = response.data || [];
  } catch (err: any) {
    error.value = err.message || '获取订阅文章失败';
    posts.value = [];
  } finally {
    loading.value = false;
  }
}

function formatDate(dateStr: string | Date | null) {
  if (!dateStr) return '';
  const date = new Date(dateStr);
  const now = new Date();
  const diff = now.getTime() - date.getTime();
  const days = Math.floor(diff / (1000 * 60 * 60 * 24));
  const weeks = Math.floor(days / 7);
  const months = Math.floor(days / 30);
  const years = Math.floor(days / 365);

  if (days === 0) {
    const hours = Math.floor(diff / (1000 * 60 * 60));
    if (hours === 0) {
      const minutes = Math.floor(diff / (1000 * 60));
      return minutes === 0 ? '刚刚' : `${minutes}分钟前`;
    }
    return `${hours}小时前`;
  } else if (days === 1) {
    return '昨天';
  } else if (years > 0) {
    return `${years}年前`;
  } else if (months > 0) {
    return `${months}个月前`;
  } else if (weeks > 0) {
    return `${weeks}周前`;
  } else {
    return `${days}天前`;
  }
}

function truncateDescription(desc: string | null, maxLength = 150) {
  if (!desc) return '';
  return desc.length > maxLength ? desc.substring(0, maxLength) + '...' : desc;
}

onMounted(() => {
  loadPosts();
});

// 监听 posts 变化，初始化渐入动画
watch(posts, () => {
  nextTick(() => {
    const observerOptions = {
      threshold: 0.1,
      rootMargin: "0px 0px -50px 0px",
    };

    const fadeInObserver = new IntersectionObserver((entries) => {
      entries.forEach((entry) => {
        if (entry.isIntersecting) {
          entry.target.classList.add("fade-in-start");
          fadeInObserver.unobserve(entry.target);
        }
      });
    }, observerOptions);

    document.querySelectorAll(".animate-fade-in:not(.fade-in-start)").forEach((el) => {
      fadeInObserver.observe(el);
    });
  });
});
</script>

<template>
  <div class="container mx-auto px-4 py-8 max-w-5xl">
    <!-- 页面头部 -->
    <header class="mb-8 animate-fade-in">
      <h1 class="text-[3em] font-extrabold mb-2.5">订阅文章</h1>
      <p class="text-[0.8em] text-slate-600 dark:text-slate-400">来自各大订阅源的最新文章，每8小时自动更新</p>
    </header>

    <!-- 加载状态 -->
    <div v-if="loading" class="space-y-6">
      <div v-for="i in 5" :key="i" class="border rounded-lg p-6 space-y-3">
        <div class="flex items-center gap-3">
          <div class="size-10 bg-muted rounded-full animate-pulse" />
          <div class="h-4 bg-muted rounded w-32 animate-pulse" />
          <div class="h-3 bg-muted rounded w-20 animate-pulse ml-auto" />
        </div>
        <div class="h-5 bg-muted rounded w-3/4 animate-pulse" />
        <div class="h-4 bg-muted rounded w-full animate-pulse" />
        <div class="h-4 bg-muted rounded w-1/2 animate-pulse" />
      </div>
    </div>

    <!-- 错误状态 -->
    <div v-else-if="error" class="text-center py-16">
      <Icon name="lucide:alert-circle" class="size-16 text-destructive/50 mx-auto mb-4" />
      <p class="text-muted-foreground mb-4">{{ error }}</p>
      <Button variant="outline" @click="loadPosts">重试</Button>
    </div>

    <!-- 空状态 -->
    <div v-else-if="posts.length === 0" class="text-center py-16">
      <Icon name="lucide:rss" class="size-16 text-muted-foreground/30 mx-auto mb-4" />
      <p class="text-muted-foreground">暂无订阅文章</p>
      <p class="text-sm text-muted-foreground mt-2">请先在后台添加订阅源并更新</p>
    </div>

    <!-- 文章列表 -->
    <div v-else class="space-y-6">
      <article
        v-for="post in posts"
        :key="post.id"
        class="border rounded-lg p-6 hover:shadow-md hover:border-primary/50 transition-all animate-fade-in"
      >
        <div class="flex items-start gap-4">
          <!-- 订阅源头像 -->
          <a
            :href="`/subscribes?source=${post.subscribeId}`"
            class="flex-shrink-0"
            :title="post.subscribeName"
          >
            <Avatar class="size-10">
              <AvatarImage v-if="post.subscribeAvatar" :src="post.subscribeAvatar" />
              <AvatarFallback>{{ post.subscribeName?.charAt(0) || '?' }}</AvatarFallback>
            </Avatar>
          </a>

          <!-- 文章内容 -->
          <div class="flex-1 min-w-0">
            <div class="flex items-center gap-2 mb-1 flex-wrap">
              <span class="text-sm text-muted-foreground">{{ post.subscribeName }}</span>
              <span v-if="post.pubDate" class="text-xs text-muted-foreground">
                {{ formatDate(post.pubDate) }}
              </span>
            </div>
            <a
              :href="post.link"
              target="_blank"
              rel="noopener noreferrer"
              class="block group"
            >
              <h2 class="text-lg font-semibold text-foreground group-hover:text-primary transition-colors line-clamp-2">
                {{ post.title }}
              </h2>
            </a>
            <p
              v-if="post.description"
              class="text-sm text-muted-foreground mt-2 line-clamp-2"
            >
              {{ truncateDescription(post.description) }}
            </p>
          </div>

          <!-- 外部链接图标 -->
          <a
            :href="post.link"
            target="_blank"
            rel="noopener noreferrer"
            class="flex-shrink-0 text-muted-foreground hover:text-primary transition-colors"
            :title="post.title"
          >
            <Icon name="lucide:external-link" class="size-5" />
          </a>
        </div>
      </article>
    </div>
  </div>
</template>

<style scoped>
/* 滚动淡入动画 */
.animate-fade-in {
  opacity: 0;
  transform: translateY(30px);
  transition:
    opacity 0.6s cubic-bezier(0.4, 0, 0.2, 1),
    transform 0.6s cubic-bezier(0.4, 0, 0.2, 1);
}

.animate-fade-in.fade-in-start {
  opacity: 1;
  transform: translateY(0);
}
</style>
