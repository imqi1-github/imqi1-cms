<script setup lang="ts">
const props = defineProps<{
  postId: number
}>()

const submitting = ref(false)
const showEmoji = ref(false)

// 表单数据
const formData = ref({
  content: '',
  name: '',
  mail: '',
  link: '',
})

// 提交评论
async function submitComment() {
  if (!formData.value.content.trim()) {
    return
  }

  submitting.value = true
  try {
    await $fetch('/api/comments', {
      method: 'POST',
      body: {
        cid: props.postId,
        content: formData.value.content,
        name: formData.value.name,
        mail: formData.value.mail,
        link: formData.value.link,
      },
    })
    formData.value.content = ''
    // 刷新评论列表的事件可以通过 emit 或者刷新页面
    window.location.reload()
  } catch (error) {
    console.error('评论失败:', error)
  } finally {
    submitting.value = false
  }
}

// 简单的表情列表
const emojis = ['', '', '', '', '', '', '', '', '', '', '', '', '', '', '', '', '', '', '', '']

function insertEmoji(emoji: string) {
  formData.value.content += emoji
  showEmoji.value = false
}
</script>

<template>
  <div class="comment-input-box">
    <h2 class="comment-box-title">评论</h2>
    <div class="comment-box-description">
      评论即代表你已阅读并同意<a href="/agreement" class="comment-link" target="_blank">评论协议</a>。
    </div>

    <div class="comment-input-row">
      <label for="comment-content-input" class="sr-only">评论内容</label>
      <textarea
        id="comment-content-input"
        v-model="formData.content"
        placeholder="评论内容 *"
        class="comment-textarea"
        required
      />
    </div>

    <div class="comment-input-row">
      <div class="comment-input-group">
        <label for="comment-input-name" class="sr-only">昵称</label>
        <input
          id="comment-input-name"
          v-model="formData.name"
          type="text"
          placeholder="昵称 *"
          class="comment-input"
          required
        />
      </div>
      <div class="comment-input-group">
        <label for="comment-input-mail" class="sr-only">邮箱</label>
        <input
          id="comment-input-mail"
          v-model="formData.mail"
          type="email"
          placeholder="邮箱"
          class="comment-input"
        />
      </div>
      <div class="comment-input-group">
        <label for="comment-input-link" class="sr-only">链接</label>
        <input
          id="comment-input-link"
          v-model="formData.link"
          type="url"
          placeholder="链接"
          class="comment-input"
        />
      </div>

      <div class="comment-buttons">
        <button type="button" class="emoji-button" @click="showEmoji = !showEmoji">
          <Icon name="ri:emoji-sticker-line" class="size-4" />
        </button>
        <button type="button" class="submit-button" @click="submitComment" :disabled="submitting">
          {{ submitting ? '提交中...' : '提交评论' }}
        </button>
      </div>
    </div>

    <!-- 表情面板 -->
    <Transition name="emoji">
      <div v-if="showEmoji" class="emoji-box">
        <div class="emoji-list">
          <span
            v-for="emoji in emojis"
            :key="emoji"
            class="emoji-item"
            @click="insertEmoji(emoji)"
          >
            {{ emoji }}
          </span>
        </div>
      </div>
    </Transition>
    <div v-if="showEmoji" class="emoji-backdrop" @click="showEmoji = false" />
  </div>
</template>

<style scoped>
.comment-input-box {
  margin-top: 20px;
}

.comment-box-title {
  font-size: 1.3em;
  font-weight: 700;
  margin-bottom: 5px;
}

.comment-box-description {
  color: rgb(100 116 139);
  font-size: 0.875em;
  margin-bottom: 15px;
}

.comment-link {
  color: rgb(37 99 235);
  text-decoration: underline;
  text-underline-offset: 2px;
}

.comment-link:hover {
  color: rgb(29 78 216);
}

.comment-input-row {
  display: flex;
  flex-wrap: wrap;
  gap: 10px;
  margin-bottom: 10px;
  width: 100%;
}

.sr-only {
  position: absolute;
  width: 1px;
  height: 1px;
  padding: 0;
  margin: -1px;
  overflow: hidden;
  clip: rect(0, 0, 0, 0);
  white-space: nowrap;
  border-width: 0;
}

.comment-textarea {
  width: 100%;
  min-height: 10em;
  padding: 8px 12px;
  border: 1px solid rgb(226 232 240);
  border-radius: 4px;
  background: rgb(255 255 255);
  line-height: 1.5;
  resize: vertical;
  transition: border-color 0.15s, box-shadow 0.15s;
}

.dark .comment-textarea {
  background: rgb(15 23 42);
  border-color: rgb(51 65 85);
}

.comment-textarea:focus {
  outline: none;
  border-color: rgb(37 99 235);
  box-shadow: 0 0 0 3px rgb(37 99 235 / 0.1);
}

.comment-input-group {
  flex: 1;
  min-width: 150px;
}

.comment-input {
  width: 100%;
  height: 2em;
  padding: 4px 10px;
  border: 1px solid rgb(226 232 240);
  border-radius: 4px;
  background: rgb(255 255 255);
  font-size: 0.875em;
  transition: border-color 0.15s, box-shadow 0.15s;
}

.dark .comment-input {
  background: rgb(15 23 42);
  border-color: rgb(51 65 85);
}

.comment-input:focus {
  outline: none;
  border-color: rgb(37 99 235);
  box-shadow: 0 0 0 3px rgb(37 99 235 / 0.1);
}

.comment-buttons {
  display: flex;
  align-items: center;
  gap: 8px;
  margin-left: auto;
}

.emoji-button,
.submit-button {
  border: none;
  border-radius: 4px;
  padding: 6px 12px;
  cursor: pointer;
  font-size: 0.875em;
  font-weight: 600;
  transition: background-color 0.15s;
}

.emoji-button {
  background: rgb(241 245 249);
  color: rgb(51 65 85);
}

.dark .emoji-button {
  background: rgb(30 41 59);
  color: rgb(203 213 225);
}

.emoji-button:hover {
  background: rgb(226 232 240);
}

.dark .emoji-button:hover {
  background: rgb(51 65 85);
}

.submit-button {
  background: rgb(37 99 235);
  color: white;
}

.submit-button:hover:not(:disabled) {
  background: rgb(29 78 216);
}

.submit-button:disabled {
  opacity: 0.7;
  cursor: not-allowed;
}

/* 表情面板 */
.emoji-box {
  position: relative;
  z-index: 10;
  margin-top: 10px;
  padding: 10px;
  background: rgb(255 255 255);
  border: 1px solid rgb(226 232 240);
  border-radius: 8px;
  box-shadow: 0 4px 6px -1px rgb(0 0 0 / 0.1);
}

.dark .emoji-box {
  background: rgb(15 23 42);
  border-color: rgb(51 65 85);
}

.emoji-list {
  display: flex;
  flex-wrap: wrap;
  gap: 5px;
  max-height: 150px;
  overflow-y: auto;
}

.emoji-item {
  font-size: 1.5em;
  cursor: pointer;
  padding: 4px;
  border-radius: 4px;
  transition: background-color 0.15s;
}

.emoji-item:hover {
  background: rgb(241 245 249);
}

.dark .emoji-item:hover {
  background: rgb(30 41 59);
}

.emoji-backdrop {
  position: fixed;
  inset: 0;
  z-index: 5;
}

/* 表情面板动画 */
.emoji-enter-active,
.emoji-leave-active {
  transition: opacity 0.2s, transform 0.2s;
}

.emoji-enter-from,
.emoji-leave-to {
  opacity: 0;
  transform: translateY(-10px);
}

/* 响应式 */
@media (max-width: 640px) {
  .comment-input-group {
    min-width: 100%;
  }

  .comment-buttons {
    width: 100%;
    margin-left: 0;
    justify-content: flex-end;
  }
}
</style>
