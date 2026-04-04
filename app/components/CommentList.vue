<script setup lang="ts">
import { ref, computed, onMounted } from 'vue';

const props = defineProps<{
  postId: number
}>();

const comments = ref<any[]>([]);
const loading = ref(true);
const error = ref('');

// 回复状态管理
const replyState = ref({
  isReplying: false,
  replyTo: null as { id: number; name: string } | null,
  targetCommentId: null as number | null
});

// 开始回复
function startReply(comment: any) {
  replyState.value = {
    isReplying: true,
    replyTo: {
      id: comment.coid,
      name: comment.name
    },
    targetCommentId: comment.coid
  };
}

// 取消回复
function cancelReply() {
  replyState.value = {
    isReplying: false,
    replyTo: null,
    targetCommentId: null
  };
}

// 获取评论数据
const fetchComments = async () => {
  loading.value = true;
  error.value = '';

  try {
    const response = await fetch(`/api/comments?cid=${props.postId}`);
    const data = await response.json();

    if (data.code === 200) {
      comments.value = data.data;
    } else {
      error.value = data.message || '获取评论失败';
    }
  } catch (err) {
    error.value = '网络错误，请稍后重试';
  } finally {
    loading.value = false;
  }
};

// 格式化日期
const formatDate = (dateString: string) => {
  const date = new Date(dateString);
  const now = new Date();
  const diff = now.getTime() - date.getTime();

  const minutes = Math.floor(diff / 60000);
  const hours = Math.floor(diff / 3600000);
  const days = Math.floor(diff / 86400000);

  if (minutes < 1) return '刚刚';
  if (minutes < 60) return `${minutes}分钟前`;
  if (hours < 24) return `${hours}小时前`;
  if (days < 7) return `${days}天前`;

  return date.toLocaleDateString('zh-CN');
};

// 获取头像文字
const getAvatarLetter = (name: string) => {
  return name?.charAt(0)?.toUpperCase() || '?';
};

// 获取链接文字
const getLinkText = (url: string) => {
  try {
    return new URL(url).hostname;
  } catch {
    return url;
  }
};

// 组件挂载时获取评论
onMounted(() => {
  fetchComments();
});
</script>

<template>
  <div class="comment-list-container">
    <h2 class="comment-title">评论 ({{ comments.length }})</h2>

    <!-- 加载状态 -->
    <div v-if="loading" class="py-8 text-center">
      <div class="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600 mx-auto"></div>
      <p class="mt-2 text-slate-500">加载评论中...</p>
    </div>

    <!-- 错误状态 -->
    <div v-else-if="error" class="py-8 text-center">
      <Icon name="lucide:alert-circle" class="size-8 text-red-500 mx-auto mb-2" />
      <p class="text-red-500">{{ error }}</p>
      <button
        @click="fetchComments"
        class="mt-4 px-4 py-2 bg-blue-600 text-white rounded hover:bg-blue-700 transition-colors"
      >
        重试
      </button>
    </div>

    <!-- 空状态 -->
    <div v-else-if="comments.length === 0" class="py-8 text-center">
      <Icon name="lucide:message-square" class="size-12 text-slate-300 dark:text-slate-600 mx-auto mb-4" />
      <p class="text-slate-500">暂无评论，快来发表第一条评论吧！</p>
    </div>

    <!-- 默认评论框 -->
    <div v-if="!replyState.isReplying" class="default-comment-box">
      <CommentInput :post-id="props.postId" />
    </div>

    <!-- 评论列表 -->
    <ul class="comment-list">
      <li v-for="comment in comments" :key="comment.coid" class="comment-body">
        <div class="comment-body-inner">
          <!-- 头像区域 -->
          <div class="comment-avatar-box" data-tip="回复">
            <button class="reply-button" title="回复" @click="startReply(comment)">
              <Icon name="ri-reply-fill" class="size-5" />
            </button>
            <div class="comment-avatar">
              <span class="avatar-letter">{{ getAvatarLetter(comment.name) }}</span>
            </div>
          </div>

          <!-- 评论主体 -->
          <div class="comment-main">
            <!-- 元信息 -->
            <div class="comment-meta">
              <span class="comment-author">{{ comment.name }}</span>
              <a v-if="comment.link" :href="comment.link" class="comment-link" target="_blank" rel="noreferrer noopener nofollow">
                {{ getLinkText(comment.link) }}
              </a>
              <span class="comment-date">{{ formatDate(comment.create_time) }}</span>
            </div>

            <!-- 评论内容 -->
            <div class="comment-content">
              {{ comment.content }}
            </div>

            <!-- 底部信息 -->
            <div class="comment-information">
              <span data-tip="评论时间">
                <Icon name="ri-time-fill" class="size-3" />
                {{ formatDate(comment.create_time) }}
              </span>
              <span data-tip="浏览器">
                <Icon name="ri-computer-line" class="size-3" />
                {{ comment.agent || '未知' }}
              </span>
            </div>
          </div>
        </div>

        <!-- 回复评论框 -->
        <div v-if="replyState.isReplying && replyState.targetCommentId === comment.coid" class="reply-comment-box">
          <CommentInput
            :post-id="props.postId"
            :is-reply="true"
            :reply-to="replyState.replyTo"
            @cancel-reply="cancelReply"
          />
        </div>

        <!-- 子评论（嵌套） -->
        <div v-if="comment.children?.length > 0" class="comment-children">
          <ul class="comment-list">
            <li v-for="child in comment.children" :key="child.coid" class="comment-body">
              <div class="comment-body-inner">
                <div class="comment-avatar-box" data-tip="回复">
                  <button class="reply-button" title="回复" @click="startReply(child)" >
                    <Icon name="ri-reply-fill" class="size-4" />
                  </button>
                  <div class="comment-avatar">
                    <span class="avatar-letter">{{ getAvatarLetter(child.name) }}</span>
                  </div>
                </div>

                <div class="comment-main">
                  <div class="comment-meta">
                    <span class="comment-author">{{ child.name }}</span>
                    <a v-if="child.link" :href="child.link" class="comment-link" target="_blank" rel="noreferrer noopener nofollow">
                      {{ getLinkText(child.link) }}
                    </a>
                    <span class="comment-date">{{ formatDate(child.create_time) }}</span>
                  </div>

                  <div class="comment-content">
                    {{ child.content }}
                  </div>

                  <div class="comment-information">
                    <span data-tip="评论时间">
                      <Icon name="ri-time-fill" class="size-3" />
                      {{ formatDate(child.create_time) }}
                    </span>
                    <span data-tip="浏览器">
                      <Icon name="ri-computer-line" class="size-3" />
                      {{ child.agent || '未知' }}
                    </span>
                  </div>
                </div>
              </div>

              <!-- 回复评论框 -->
              <div v-if="replyState.isReplying && replyState.targetCommentId === child.coid" class="reply-comment-box">
                <CommentInput
                  :post-id="props.postId"
                  :is-reply="true"
                  :reply-to="replyState.replyTo"
                  @cancel-reply="cancelReply"
                />
              </div>

              <!-- 第三级嵌套 -->
              <div v-if="child.children?.length > 0" class="comment-children">
                <ul class="comment-list">
                  <li v-for="grandchild in child.children" :key="grandchild.coid" class="comment-body">
                    <div class="comment-body-inner">
                      <div class="comment-avatar-box" data-tip="回复">

                 <button class="reply-button" title="回复" @click="startReply(grandchild)">
                          <Icon name="ri-reply-fill" class="size-4" />
                        </button>
                        <div class="comment-avatar">
                          <span class="avatar-letter">{{ getAvatarLetter(grandchild.name) }}</span>
                        </div>
                      </div>

                      <div class="comment-main">
                        <div class="comment-meta">
                          <span class="comment-author">{{ grandchild.name }}</span>
                          <a v-if="grandchild.link" :href="grandchild.link" class="comment-link" target="_blank" rel="noreferrer noopener nofollow">
                            {{ getLinkText(grandchild.link) }}
                          </a>
                          <span class="comment-date">{{ formatDate(grandchild.create_time) }}</span>
                        </div>

                        <div class="comment-content">
                          {{ grandchild.content }}
                        </div>

                        <div class="comment-information">
                          <span data-tip="评论时间">
                            <Icon name="ri-time-fill" class="size-3" />
                            {{ formatDate(grandchild.create_time) }}
                          </span>
                          <span data-tip="浏览器">
                            <Icon name="ri-computer-line" class="size-3" />
                            {{ grandchild.agent || '未知' }}
                          </span>
                        </div>
                      </div>
                    </div>

                    <!-- 回复评论框 -->
                    <div v-if="replyState.isReplying && replyState.targetCommentId === grandchild.coid" class="reply-comment-box">
                      <CommentInput
                        :post-id="props.postId"
                        :is-reply="true"
                        :reply-to="replyState.replyTo"
                        @cancel-reply="cancelReply"
                      />
                    </div>

                    <!-- 第四级及以上嵌套（如果有的话） -->
                    <div v-if="grandchild.children?.length > 0" class="comment-children">
                      <ul class="comment-list">
                        <li v-for="greatgrandchild in grandchild.children" :key="greatgrandchild.coid" class="comment-body">
                          <div class="comment-body-inner">
                            <div class="comment-avatar-box" data-tip="回复">
                              <button class="reply-button" title="回复">
                                <Icon name="ri-reply-fill" class="size-4" />
                              </button>
                              <div class="comment-avatar">
                                <span class="avatar-letter">{{ getAvatarLetter(greatgrandchild.name) }}</span>
                              </div>
                            </div>

                            <div class="comment-main">
                              <div class="comment-meta">
                                <span class="comment-author">{{ greatgrandchild.name }}</span>
                                <a v-if="greatgrandchild.link" :href="greatgrandchild.link" class="comment-link" target="_blank" rel="noreferrer noopener nofollow">
                                  {{ getLinkText(greatgrandchild.link) }}
                                </a>
                                <span class="comment-date">{{ formatDate(greatgrandchild.create_time) }}</span>
                              </div>

                              <div class="comment-content">
                                {{ greatgrandchild.content }}
                              </div>

                              <div class="comment-information">
                                <span data-tip="评论时间">
                                  <Icon name="ri-time-fill" class="size-3" />
                                  {{ formatDate(greatgrandchild.create_time) }}
                                </span>
                                <span data-tip="浏览器">
                                  <Icon name="ri-computer-line" class="size-3" />
                                  {{ greatgrandchild.agent || '未知' }}
                                </span>
                              </div>
                            </div>
                          </div>
                        </li>
                      </ul>
                    </div>
                  </li>
                </ul>
              </div>
            </li>
          </ul>
        </div>
      </li>
    </ul>
  </div>
</template>

<style scoped>
.comment-list-container {
  margin-top: 20px;
}

.comment-title {
  font-size: 1.3em;
  font-weight: 700;
  margin-bottom: 15px;
}

.comment-list {
  list-style: none;
  padding: 0;
  margin: 0;
}

.comment-body {
  margin-bottom: 15px;
}

.comment-body-inner {
  display: flex;
  gap: 12px;
}

/* 头像区域 */
.comment-avatar-box {
  position: relative;
  width: 48px;
  height: 48px;
  flex-shrink: 0;
}

.reply-button {
  position: absolute;
  top: -8px;
  right: -8px;
  background: white;
  border: 1px solid #e5e7eb;
  border-radius: 50%;
  width: 24px;
  height: 24px;
  display: flex;
  align-items: center;
  justify-content: center;
  cursor: pointer;
  color: #6b7280;
  transition: all 0.2s;
}

.dark .reply-button {
  background: #1e293b;
  border-color: #475569;
  color: #94a3b8;
}

.reply-button:hover {
  color: #3b82f6;
  transform: scale(1.1);
}

.comment-avatar {
  width: 48px;
  height: 48px;
  border-radius: 50%;
  background: #f1f5f9;
  display: flex;
  align-items: center;
  justify-content: center;
  font-weight: 600;
  font-size: 18px;
  color: #334155;
  flex-shrink: 0;
}

.dark .comment-avatar {
  background: #334155;
  color: #f1f5f9;
}

.avatar-letter {
  line-height: 1;
}

/* 评论主体 */
.comment-main {
  flex: 1;
  min-width: 0;
}

/* 元信息 */
.comment-meta {
  display: flex;
  align-items: center;
  gap: 8px;
  flex-wrap: wrap;
}

.comment-author {
  font-weight: 600;
  color: rgb(15 23 42);
}

.dark .comment-author {
  color: rgb(241 245 249);
}

.comment-link {
  font-size: 12px;
  color: rgb(100 116 139);
  text-decoration: none;
}

.dark .comment-link {
  color: rgb(148 163 184);
}

.comment-link:hover {
  color: rgb(37 99 235);
}

.comment-date {
  font-size: 12px;
  color: rgb(100 116 139);
}

.dark .comment-date {
  color: rgb(148 163 184);
}

/* 评论内容 */
.comment-content {
  line-height: 1.6;
  margin: 10px 0;
  color: rgb(71 85 105);
}

.dark .comment-content {
  color: rgb(203 213 225);
}

/* 底部信息 */
.comment-information {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  padding: 4px 8px;
  background: rgb(241 245 249);
  border-radius: 6px;
  font-size: 12px;
  color: rgb(100 116 139);
}

.dark .comment-information {
  background: rgb(30 41 59);
  color: rgb(148 163 184);
}

.comment-information span {
  display: inline-flex;
  align-items: center;
  gap: 3px;
}

/* 嵌套评论 */
.comment-children > .comment-list > .comment-body > .comment-body-inner {
  padding-left: 30px;
}

/* 第三级及以上不再增加缩进 */
.comment-children .comment-children > .comment-list > .comment-body > .comment-body-inner {
  padding-left: 0;
}

.default-comment-box {
  margin-bottom: 30px;
}

.reply-comment-box {
  margin-top: 20px;
  padding-top: 20px;
  border-top: 1px solid rgb(226 232 240);
}

.dark .reply-comment-box {
  border-top-color: rgb(30 41 59);
}

/* 响应式 */
@media (max-width: 640px) {
  .comment-avatar-box {
    width: 40px;
    height: 40px;
  }

  .comment-avatar {
    width: 40px;
    height: 40px;
    font-size: 16px;
  }

  .comment-main {
    margin-left: 12px;
  }

  .comment-children > .comment-list > .comment-body > .comment-body-inner {
    padding-left: 20px;
  }
}
</style>
