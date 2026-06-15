<script setup lang="ts">
import { onMounted, ref } from "vue";

const props = defineProps<{
  postId: number;
  loadAllComments?: boolean;
}>();

const comments = ref<any[]>([]);
const loading = ref(true);
const refreshing = ref(false);
const error = ref("");
const avatarService = ref("gravatar");
const pageSize = ref(10);
const currentPage = ref(1);
const totalComments = ref(0);
const hasMore = ref(false);
const loadingMore = ref(false);
const maxLevel = ref(4);
const commentInterval = ref(60);
const requireMail = ref(true);
const requireLink = ref(false);

// 使用全局认证状态
const { isLoggedIn, isLoadingAuth } = useAuth();

// 使用全局站点设置
const { siteSettings } = useSiteSettings();

const replyState = ref({
  isReplying: false,
  replyTo: null as { id: number; name: string } | null,
  targetCommentId: null as number | null,
});

// 共享的表单数据（所有CommentInput实例共用）
const formData = ref({
  content: "",
  name: "",
  mail: "",
  link: "",
});

function startReply(comment: any) {
  replyState.value = {
    isReplying: true,
    replyTo: {
      id: comment.coid,
      name: comment.name,
    },
    targetCommentId: comment.coid,
  };
}

function cancelReply() {
  replyState.value = {
    isReplying: false,
    replyTo: null,
    targetCommentId: null,
  };
}

const fetchComments = async (isRefresh = false, page = 1) => {
  if (isRefresh) {
    refreshing.value = true;
  } else if (page > 1) {
    loadingMore.value = true;
  } else {
    loading.value = true;
  }
  error.value = "";

  try {
    const response = await fetch(`/api/comments?cid=${props.postId}&page=${page}&pageSize=${pageSize.value}`);
    const data = await response.json();

    if (data.code === 200) {
      if (page === 1 || isRefresh) {
        comments.value = data.data;
      } else {
        comments.value = [...comments.value, ...data.data];
      }
      currentPage.value = page;
      // 使用 totalAllComments 显示所有评论总数（包括子评论）
      totalComments.value = data.pagination.totalAllComments;
      hasMore.value = data.pagination.hasMore;
    } else {
      error.value = data.message || "获取评论失败";
    }
  } catch (err) {
    error.value = "网络错误，请稍后重试";
  } finally {
    loading.value = false;
    refreshing.value = false;
    loadingMore.value = false;
  }
};

const loadMore = () => {
  if (hasMore.value && !loadingMore.value) {
    fetchComments(false, currentPage.value + 1);
  }
};

// 监听站点设置变化，更新评论配置
watch(
  () => siteSettings.value,
  (settings) => {
    if (settings) {
      if (settings.commentAvatarService) {
        avatarService.value = settings.commentAvatarService;
      }
      if (settings.commentPageSize) {
        pageSize.value = Number(settings.commentPageSize);
      }
      if (settings.commentMaxLevel !== undefined) {
        maxLevel.value = Number(settings.commentMaxLevel);
      }
      if (settings.commentInterval !== undefined) {
        commentInterval.value = Number(settings.commentInterval);
      }
      if (settings.commentRequireMail !== undefined) {
        requireMail.value = settings.commentRequireMail === true || settings.commentRequireMail === 'true';
      }
      if (settings.commentRequireLink !== undefined) {
        requireLink.value = settings.commentRequireLink === true || settings.commentRequireLink === 'true';
      }
    }
  },
  { immediate: true }
);

onMounted(async () => {
  // 等待站点设置加载完成，确保使用正确的 pageSize
  const settings = await useSiteSettings().fetchSiteSettings();

  // 直接从设置中读取配置，而不是依赖 watch
  if (settings) {
    if (settings.commentPageSize) {
      pageSize.value = Number(settings.commentPageSize);
    }
    if (settings.commentAvatarService) {
      avatarService.value = settings.commentAvatarService;
    }
    if (settings.commentMaxLevel !== undefined) {
      maxLevel.value = Number(settings.commentMaxLevel);
    }
    if (settings.commentInterval !== undefined) {
      commentInterval.value = Number(settings.commentInterval);
    }
    if (settings.commentRequireMail !== undefined) {
      requireMail.value = settings.commentRequireMail === true || settings.commentRequireMail === 'true';
    }
    if (settings.commentRequireLink !== undefined) {
      requireLink.value = settings.commentRequireLink === true || settings.commentRequireLink === 'true';
    }
  }

  // 如果需要加载所有评论，使用大 pageSize
  if (props.loadAllComments) {
    const actualPageSize = 10000;
    const response = await fetch(`/api/comments?cid=${props.postId}&page=1&pageSize=${actualPageSize}`);
    const data = await response.json();
    if (data.code === 200) {
      comments.value = data.data;
      // 使用 totalAllComments 显示所有评论总数（包括子评论）
      totalComments.value = data.pagination.totalAllComments;
      hasMore.value = data.pagination.hasMore;
    }
    loading.value = false;
  } else {
    fetchComments();
  }
});

function handleCommentSubmitted() {
  fetchComments(true, 1);
  cancelReply();
}
</script>

<template>
  <div class="mt-5 min-h-50">
    <!-- 加载状态（首次加载） -->
    <div v-if="loading" class="py-8 text-center">
      <div class="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600 mx-auto"></div>
      <p class="mt-2 text-slate-500">加载评论中...</p>
    </div>

    <!-- 错误状态 -->
    <div v-else-if="error" class="py-8 text-center">
      <Icon name="lucide:alert-circle" class="size-8 text-red-500 mx-auto mb-2" />
      <p class="text-red-500">{{ error }}</p>
      <button @click="() => fetchComments()" class="mt-4 px-4 py-2 bg-blue-600 text-white rounded hover:bg-blue-700 transition-colors">重试</button>
    </div>

    <!-- 评论框（加载完成后显示） -->
    <template v-else>
      <!-- 刷新指示器 -->
      <div v-if="refreshing" class="py-2 text-center">
        <div class="animate-spin rounded-full h-5 w-5 border-b-2 border-blue-600 mx-auto"></div>
      </div>

      <!-- 默认评论框 -->
      <div v-if="!replyState.isReplying" class="mb-8">
        <CommentInput
          :form-data="formData"
          :post-id="props.postId"
          :comment-interval="commentInterval"
          :require-mail="requireMail"
          :require-link="requireLink"
          @comment-submitted="handleCommentSubmitted" />
      </div>

      <!-- 评论统计 -->
      <div v-if="totalComments > 0" class="mb-4 flex items-center justify-between text-sm text-slate-500 dark:text-slate-400">
        <span>共 {{ totalComments }} 条评论</span>
        <!-- 管理评论链接（仅登录时显示） -->
        <ClientOnly>
          <a
            v-if="isLoggedIn && !isLoadingAuth"
            :href="`/admin/comments?cid=${props.postId}`"
            target="_blank"
            rel="noopener noreferrer"
            class="inline-flex items-center gap-1 text-xs text-blue-600 dark:text-blue-400 hover:underline">
            <Icon name="lucide:settings" class="size-3" />
            管理此文章评论
          </a>
        </ClientOnly>
      </div>

      <!-- 评论列表容器 -->
      <Transition name="comment-fade" mode="out-in">
        <!-- 空状态 -->
        <div v-if="comments.length === 0" key="empty" class="py-8 text-center">
          <Icon name="lucide:message-square" class="size-12 text-slate-300 dark:text-slate-600 mx-auto mb-4" />
          <p class="text-slate-500">暂无评论</p>
        </div>

        <!-- 评论列表（使用递归组件） -->
        <div v-else key="list">
          <ul class="space-y-6">
            <CommentItem
              v-for="comment in comments"
              :key="comment.coid"
              :comment="comment"
              :post-id="props.postId"
              :reply-state="replyState"
              :avatar-service="avatarService"
              :max-level="maxLevel"
              :current-level="1"
              :comment-interval="commentInterval"
              :require-mail="requireMail"
              :require-link="requireLink"
              :form-data="formData"
              @start-reply="startReply"
              @cancel-reply="cancelReply"
              @comment-submitted="handleCommentSubmitted" />
          </ul>

          <!-- 加载更多 -->
          <div v-if="hasMore" class="mt-6 text-center">
            <button
              @click="loadMore"
              :disabled="loadingMore"
              class="px-6 py-2 text-sm text-blue-600 dark:text-blue-400 border border-blue-600 dark:border-blue-400 rounded-full hover:bg-blue-50 dark:hover:bg-blue-900/20 transition-colors disabled:opacity-50 disabled:cursor-not-allowed">
              <span v-if="loadingMore" class="flex items-center gap-2">
                <div class="animate-spin rounded-full h-4 w-4 border-b-2 border-blue-600"></div>
                加载中...
              </span>
              <span v-else>加载更多评论</span>
            </button>
          </div>
        </div>
      </Transition>
    </template>
  </div>
</template>

<style scoped>
/* 根级评论不需要缩进 */
:deep(ul.space-y-6) > li > div.flex {
  padding-left: 0;
}

/* 评论列表过渡动画 */
.comment-fade-enter-active,
.comment-fade-leave-active {
  transition:
    opacity 0.3s ease,
    transform 0.3s ease;
}

.comment-fade-enter-from {
  opacity: 0;
  transform: translateY(10px);
}

.comment-fade-leave-to {
  opacity: 0;
  transform: translateY(-10px);
}
</style>
