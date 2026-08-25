<script setup lang="ts">
import { onMounted, ref } from "vue";

import type { CommentsApiResponse } from "~/types/apis/comments";
import type { Comment, CommentFormData, ReplyState } from "~/types/components/comment";

const props = defineProps<{
  contentId: number;
  loadAllComments?: boolean;
}>();

const comments = ref<Comment[]>([]);
const loading = ref(true);
const refreshing = ref(false);
const error = ref("");
const pageSize = ref(10);
const currentPage = ref(1);
const totalComments = ref(0);
const hasMore = ref(false);
const loadingMore = ref(false);
const maxLevel = ref(4);
const commentInterval = ref(60);
const requireMail = ref(true);
const requireLink = ref(false);
// 请求序号守卫：静默刷新 vs 在途 loadMore 竞争时只允许最新请求写状态
let fetchSeq = 0;

// 使用全局认证状态
const { isLoggedIn, isLoadingAuth } = useAuth();

// 使用全局站点设置
const { siteSettings } = useSiteSettings();

const replyState = ref<ReplyState>({
  isReplying: false,
  replyTo: null,
  targetCommentId: null,
});

// 共享的表单数据（所有CommentInput实例共用）
const formData = ref<CommentFormData>({
  content: "",
  name: "",
  mail: "",
  link: "",
});

function startReply(comment: Comment) {
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

const fetchComments = async (isRefresh = false, page = 1, silent = false) => {
  const seq = ++fetchSeq;
  // silent=true（如提交评论后刷新）时不切换任何 loading 标志，
  // 避免顶部的 refreshing 旋转指示器插入/移除把下方评论框顶下去造成布局偏移
  if (!silent) {
    if (isRefresh) {
      refreshing.value = true;
    } else if (page > 1) {
      loadingMore.value = true;
    } else {
      loading.value = true;
    }
  }
  error.value = "";

  try {
    const response = await fetch(`/api/comments?cid=${props.contentId}&page=${page}&pageSize=${pageSize.value}`);
    const data: CommentsApiResponse = await response.json();

    if (seq !== fetchSeq) return;
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
  } catch {
    if (seq !== fetchSeq) return;
    error.value = "网络错误，请稍后重试";
  } finally {
    if (seq === fetchSeq) {
      loading.value = false;
      refreshing.value = false;
      loadingMore.value = false;
    }
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
        requireMail.value = settings.commentRequireMail === true;
      }
      if (settings.commentRequireLink !== undefined) {
        requireLink.value = settings.commentRequireLink === true;
      }
    }
  },
  { immediate: true }
);

onMounted(async () => {
  // 等待站点设置加载完成，确保使用正确的 pageSize；失败则沿用默认值，不阻断评论加载/loading 复位
  let settings = null;
  try {
    settings = await useSiteSettings().fetchSiteSettings();
  } catch {
    settings = null;
  }

  // 直接从设置中读取配置，而不是依赖 watch
  if (settings) {
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
      requireMail.value = settings.commentRequireMail === true;
    }
    if (settings.commentRequireLink !== undefined) {
      requireLink.value = settings.commentRequireLink === true;
    }
  }

  // 如果需要加载所有评论，使用大 pageSize
  if (props.loadAllComments) {
    const actualPageSize = 10000;
    const response = await fetch(`/api/comments?cid=${props.contentId}&page=1&pageSize=${actualPageSize}`);
    const data: CommentsApiResponse = await response.json();
    if (data.code === 200) {
      comments.value = data.data;
      // 使用 totalAllComments 显示所有评论总数（包括子评论）
      totalComments.value = data.pagination.totalAllComments;
      hasMore.value = data.pagination.hasMore;
    } else {
      error.value = data.message || "获取评论失败";
    }
    loading.value = false;
  } else {
    fetchComments();
  }
});

function handleCommentSubmitted() {
  // 静默刷新：不显示 refreshing 指示器，避免评论框被顶部 spinner 顶动产生布局偏移
  fetchComments(true, 1, true);
  cancelReply();
}
</script>

<template>
  <div class="mt-5 min-h-50">
    <!-- 加载状态（首次加载） -->
    <div v-if="loading" class="py-8 text-center">
      <div class="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600 mx-auto"/>
      <p class="mt-2 text-slate-500">加载评论中...</p>
    </div>

    <!-- 错误状态 -->
    <div v-else-if="error" class="py-8 text-center">
      <Icon name="lucide:alert-circle" class="size-8 text-red-500 mx-auto mb-2" />
      <p class="text-red-500">{{ error }}</p>
      <button class="mt-4 px-4 py-2 bg-blue-600 text-white rounded hover:bg-blue-700 transition-colors" @click="() => fetchComments()">重试</button>
    </div>

    <!-- 评论框（加载完成后显示） -->
    <template v-else>
      <!-- 刷新指示器 -->
      <div v-if="refreshing" class="py-2 text-center">
        <div class="animate-spin rounded-full h-5 w-5 border-b-2 border-blue-600 mx-auto"/>
      </div>

      <!-- 默认评论框 -->
      <div v-if="!replyState.isReplying" class="mb-8">
        <CommentInput
          :form-data="formData"
          :content-id="props.contentId"
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
            :href="`/admin/comments?cid=${props.contentId}`"
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
              :content-id="props.contentId"
              :reply-state="replyState"
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
              :disabled="loadingMore"
              class="px-6 py-2 text-sm text-blue-600 dark:text-blue-400 border border-blue-600 dark:border-blue-400 rounded-full hover:bg-blue-50 dark:hover:bg-blue-900/20 transition-colors disabled:opacity-50 disabled:cursor-not-allowed cursor-pointer"
              @click="loadMore">
              <div v-if="loadingMore" class="flex items-center gap-2">
                <div class="animate-spin rounded-full h-4 w-4 border-b-2 border-blue-600"/>
                加载中...
              </div>
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
</style>