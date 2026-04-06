<script setup lang="ts">
const props = defineProps<{
  comment: any;
  postId: number;
  replyState: {
    isReplying: boolean;
    replyTo: { id: number; name: string } | null;
    targetCommentId: number | null;
  };
}>();

const emit = defineEmits<{
  (e: "start-reply", comment: any): void;
  (e: "cancel-reply"): void;
  (e: "comment-submitted"): void;
}>();

// 格式化日期
const formatDate = (dateString: string) => {
  const date = new Date(dateString);
  const now = new Date();
  const diff = now.getTime() - date.getTime();

  const minutes = Math.floor(diff / 60000);
  const hours = Math.floor(diff / 3600000);
  const days = Math.floor(diff / 86400000);

  if (minutes < 1) return "刚刚";
  if (minutes < 60) return `${minutes}分钟前`;
  if (hours < 24) return `${hours}小时前`;
  if (days < 7) return `${days}天前`;

  return date.toLocaleDateString("zh-CN");
};

// 获取头像文字
const getAvatarLetter = (name: string) => {
  return name?.charAt(0)?.toUpperCase() || "?";
};

// 获取链接文字
const getLinkText = (url: string) => {
  try {
    return new URL(url).hostname;
  } catch {
    return url;
  }
};

// 开始回复
function startReply(comment: any) {
  emit("start-reply", comment);
}

// 取消回复
function cancelReply() {
  emit("cancel-reply");
}

// 评论提交完成
function handleCommentSubmitted() {
  emit("comment-submitted");
}
</script>

<template>
  <li>
    <div class="flex gap-3">
      <!-- 头像区域 -->
      <div class="relative w-10 h-10 flex-shrink-0">
        <button
          class="absolute top-[-6px] right-[-6px] bg-white dark:bg-slate-800 border border-gray-200 dark:border-gray-700 rounded-full w-5 h-5 flex items-center justify-center cursor-pointer text-gray-500 dark:text-gray-400 transition-all hover:text-blue-600 hover:scale-110"
          title="回复"
          @click="startReply(comment)"
        >
          <Icon name="ri-reply-fill" class="size-4" />
        </button>
        <div
          class="w-10 h-10 rounded-full bg-slate-100 dark:bg-slate-700 flex items-center justify-center font-semibold text-lg text-slate-700 dark:text-slate-300 flex-shrink-0"
        >
          <span>{{ getAvatarLetter(comment.name) }}</span>
        </div>
      </div>

      <!-- 评论主体 -->
      <div class="flex-1 min-w-0">
        <!-- 元信息 -->
        <div class="flex items-center gap-2 flex-wrap">
          <span class="font-semibold text-slate-900 dark:text-slate-100">{{ comment.name }}</span>
          <a
            v-if="comment.link"
            :href="comment.link"
            class="text-xs text-slate-500 dark:text-slate-400 hover:text-blue-600 transition-colors no-underline"
            target="_blank"
            rel="noreferrer noopener nofollow"
          >
            {{ getLinkText(comment.link) }}
          </a>
        </div>

        <!-- 评论内容 -->
        <div class="line-clamp-2 leading-relaxed my-2 text-slate-700 dark:text-slate-300">
          <EmojiParser :content="comment.content" />
        </div>

        <!-- 底部信息 -->
        <div
          class="inline-flex items-center gap-1.5 px-2 py-1 bg-slate-100 dark:bg-slate-800 rounded text-xs text-slate-500 dark:text-slate-400"
        >
          <span class="flex items-center gap-1">
            <Icon name="ri-time-fill" class="size-3" />
            {{ formatDate(comment.create_time) }}
          </span>
          <span class="flex items-center gap-1">
            <Icon name="ri-computer-line" class="size-3" />
            {{ comment.agent || "未知" }}
          </span>
        </div>
      </div>
    </div>

    <!-- 回复评论框 -->
    <div
      v-if="replyState.isReplying && replyState.targetCommentId === comment.coid"
      class="mt-4 pt-4 border-t border-gray-200 dark:border-gray-800"
    >
      <CommentInput
        :post-id="postId"
        :is-reply="true"
        :reply-to="replyState.replyTo"
        @cancel-reply="cancelReply"
        @comment-submitted="handleCommentSubmitted"
      />
    </div>

    <!-- 子评论（递归） -->
    <div v-if="comment.children?.length > 0" class="mt-4">
      <ul class="space-y-4">
        <CommentItem
          v-for="child in comment.children"
          :key="child.coid"
          :comment="child"
          :post-id="postId"
          :reply-state="replyState"
          @start-reply="startReply"
          @cancel-reply="cancelReply"
          @comment-submitted="handleCommentSubmitted"
        />
      </ul>
    </div>
  </li>
</template>

<style scoped>
/* 递归组件的缩进样式 */
:deep(ul) > li > div.flex {
  padding-left: 20px;
}

@media (max-width: 640px) {
  :deep(ul) > li > div.flex {
    padding-left: 12px;
  }
}
</style>
