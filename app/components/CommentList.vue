<script setup lang="ts">
import { onMounted, ref } from "vue";

const props = defineProps<{
  postId: number;
}>();

const comments = ref<any[]>([]);
const loading = ref(true);
const error = ref("");

// 回复状态管理
const replyState = ref({
  isReplying: false,
  replyTo: null as { id: number; name: string } | null,
  targetCommentId: null as number | null,
});

// 开始回复
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

// 取消回复
function cancelReply() {
  replyState.value = {
    isReplying: false,
    replyTo: null,
    targetCommentId: null,
  };
}

// 获取评论数据
const fetchComments = async () => {
  loading.value = true;
  error.value = "";

  try {
    const response = await fetch(`/api/comments?cid=${props.postId}`);
    const data = await response.json();

    if (data.code === 200) {
      comments.value = data.data;
    } else {
      error.value = data.message || "获取评论失败";
    }
  } catch (err) {
    error.value = "网络错误，请稍后重试";
  } finally {
    loading.value = false;
  }
};

// 组件挂载时获取评论
onMounted(() => {
  fetchComments();
});

// 处理评论提交事件
function handleCommentSubmitted() {
  fetchComments();
  // 取消回复状态
  cancelReply();
}
</script>

<template>
  <div class="mt-5">
    <h2 class="text-[1.3em] font-bold mb-4">评论 ({{ comments.length }})</h2>

    <!-- 加载状态 -->
    <div v-if="loading" class="py-8 text-center">
      <div class="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600 mx-auto"></div>
      <p class="mt-2 text-slate-500">加载评论中...</p>
    </div>

    <!-- 错误状态 -->
    <div v-else-if="error" class="py-8 text-center">
      <Icon name="lucide:alert-circle" class="size-8 text-red-500 mx-auto mb-2" />
      <p class="text-red-500">{{ error }}</p>
      <button @click="fetchComments" class="mt-4 px-4 py-2 bg-blue-600 text-white rounded hover:bg-blue-700 transition-colors">
        重试
      </button>
    </div>

    <!-- 空状态 -->
    <div v-else-if="comments.length === 0" class="py-8 text-center">
      <Icon name="lucide:message-square" class="size-12 text-slate-300 dark:text-slate-600 mx-auto mb-4" />
      <p class="text-slate-500">暂无评论，快来发表第一条评论吧！</p>
    </div>

    <!-- 默认评论框 -->
    <div v-if="!replyState.isReplying" class="mb-8">
      <CommentInput :post-id="props.postId" @comment-submitted="handleCommentSubmitted" />
    </div>

    <!-- 评论列表（使用递归组件） -->
    <ul v-if="comments.length > 0" class="space-y-6">
      <CommentItem
        v-for="comment in comments"
        :key="comment.coid"
        :comment="comment"
        :post-id="props.postId"
        :reply-state="replyState"
        @start-reply="startReply"
        @cancel-reply="cancelReply"
        @comment-submitted="handleCommentSubmitted"
      />
    </ul>
  </div>
</template>

<style scoped>
/* 根级评论不需要缩进 */
:deep(ul.space-y-6) > li > div.flex {
  padding-left: 0;
}
</style>
