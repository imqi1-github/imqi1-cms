<script setup lang="ts">
import type { Comment, CommentFormData, ReplyState } from "~/types/components/comment";

const props = defineProps<{
  comment: Comment;
  contentId: number;
  replyState: ReplyState;
  maxLevel: number;
  currentLevel: number;
  commentInterval: number;
  requireMail: boolean;
  requireLink: boolean;
  formData: CommentFormData;
}>();

const emit = defineEmits<{
  (e: "start-reply", comment: Comment): void;
  (e: "cancel-reply" | "comment-submitted"): void;
}>();

const formatDate = (dateString: string | Date) => {
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

const getAvatarLetter = (name: string) => {
  return name?.charAt(0)?.toUpperCase() || "?";
};

const getLinkText = (url: string) => {
  try {
    return new URL(url).hostname;
  } catch {
    return url;
  }
};

// 头像地址与设备信息均由服务端下发，前端不再接触访客邮箱/原始 UA
const avatarUrl = computed(() => props.comment.avatar || null);

const parsedAgent = computed(() => props.comment.device);

const canReply = computed(() => {
  return props.maxLevel > 0 && props.currentLevel < props.maxLevel;
});

function startReply(comment: Comment) {
  emit("start-reply", comment);
}

function cancelReply() {
  emit("cancel-reply");
}

function handleCommentSubmitted() {
  emit("comment-submitted");
}
</script>

<template>
  <li :id="`comment-${comment.coid}`">
    <div class="flex gap-3">
      <!-- 头像区域 -->
      <div class="relative w-10 h-10 shrink-0">
        <button
          v-if="canReply"
          v-tooltip="'回复'"
          class="absolute -top-1.5 -right-1.5 bg-white dark:bg-slate-800 border border-gray-200 dark:border-gray-700 rounded-full w-5 h-5 flex items-center justify-center cursor-pointer text-gray-500 dark:text-gray-400 transition-all hover:text-blue-600 hover:scale-110"
          @click="startReply(comment)">
          <Icon name="ri-reply-fill" class="size-4" />
        </button>
        <img
          v-if="avatarUrl"
          :src="avatarUrl"
          :alt="comment.name"
          class="w-10 h-10 rounded-full shrink-0 object-cover bg-slate-100 dark:bg-slate-700"
          loading="lazy" >
        <div
          v-else
          class="w-10 h-10 rounded-full bg-slate-100 dark:bg-slate-700 flex items-center justify-center font-semibold text-lg text-slate-700 dark:text-slate-300 shrink-0">
          <span>{{ getAvatarLetter(comment.name) }}</span>
        </div>
      </div>

      <!-- 评论主体 -->
      <div class="flex-1 min-w-0">
        <!-- 元信息 -->
        <div class="flex items-center gap-2 flex-wrap">
          <span class="font-semibold text-slate-900 dark:text-slate-100">{{ comment.name }}</span>
          <span v-if="comment.parent_name" class="text-sm text-slate-500 dark:text-slate-400">
            回复 <span class="text-blue-600 dark:text-blue-400">{{ comment.parent_name }}</span>
          </span>
          <a
            v-if="comment.link"
            v-tooltip="'点击前往'"
            :href="comment.link"
            class="text-xs text-slate-500 dark:text-slate-400 hover:text-blue-600 transition-colors no-underline"
            target="_blank"
            rel="noreferrer noopener nofollow">
            {{ getLinkText(comment.link) }}
          </a>
        </div>

        <!-- 评论内容 -->
        <div class="leading-relaxed my-2 text-slate-700 dark:text-slate-300">
          <EmojiParser :content="comment.content" />
        </div>

        <!-- 底部信息 -->
        <div class="inline-flex items-center gap-1.5 px-2 py-0.5 bg-slate-50 dark:bg-slate-800 rounded-full text-xs text-slate-700 dark:text-slate-300">
          <span v-tooltip="'评论时间'" class="flex items-center gap-1">
            <Icon name="ri-time-fill" class="size-4" />
            {{ formatDate(comment.create_time) }}
          </span>
          <span v-if="parsedAgent.browser || parsedAgent.os" class="flex items-center gap-1">
            <Icon v-tooltip="parsedAgent.browser" :name="parsedAgent.browserIcon" class="size-4" />
            <Icon v-tooltip="parsedAgent.os" :name="parsedAgent.osIcon" class="size-4" />
          </span>
          <span v-else v-tooltip="'未知设备'" class="flex items-center gap-1">
            <Icon name="ri-computer-line" class="size-4" />
          </span>
          <span v-if="comment.location" v-tooltip="'位置'" class="flex items-center gap-1">
            <Icon name="ri-map-pin-2-fill" class="size-4" />{{ comment.location }}
          </span>
          <span v-if="comment.isp" v-tooltip="'运营商'" class="flex items-center gap-1">
            <Icon name="ri-earth-fill" class="size-4" />{{ comment.isp }}
          </span>
        </div>
      </div>
    </div>

    <!-- 回复评论框 -->
    <div v-if="replyState.isReplying && replyState.targetCommentId === comment.coid" class="mt-4 pt-4 border-t border-gray-200 dark:border-gray-800">
      <CommentInput
        :form-data="formData"
        :content-id="contentId"
        :is-reply="true"
        :reply-to="replyState.replyTo ?? undefined"
        :comment-interval="commentInterval"
        :require-mail="requireMail"
        :require-link="requireLink"
        @cancel-reply="cancelReply"
        @comment-submitted="handleCommentSubmitted" />
    </div>

    <!-- 子评论（递归） -->
    <div v-if="comment.children.length > 0" class="mt-4">
      <ul class="space-y-4">
        <CommentItem
          v-for="child in comment.children"
          :key="child.coid"
          :comment="child"
          :content-id="contentId"
          :reply-state="replyState"
          :max-level="maxLevel"
          :current-level="currentLevel + 1"
          :comment-interval="commentInterval"
          :require-mail="requireMail"
          :require-link="requireLink"
          :form-data="formData"
          @start-reply="startReply"
          @cancel-reply="cancelReply"
          @comment-submitted="handleCommentSubmitted" />
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