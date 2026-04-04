<script setup lang="ts">
// 示例评论数据，仅用于展示样式
const demoComments = [
  {
    id: 1,
    author: '张三',
    avatar: '',
    link: 'https://example.com',
    content: '这是一条示例评论，展示了评论的基本样式。',
    date: '2小时前',
    agent: 'Chrome 120',
    children: [
      {
        id: 2,
        author: '李四',
        avatar: '',
        link: '',
        content: '这是对楼主的回复，展示了嵌套评论的样式。',
        date: '1小时前',
        agent: 'Firefox 121',
        children: [
          {
            id: 3,
            author: '张三',
            avatar: '',
            link: '',
            content: '这是第三级嵌套评论，已经达到最大嵌套层级。',
            date: '30分钟前',
            agent: 'Chrome 120',
            children: []
          }
        ]
      }
    ]
  },
  {
    id: 4,
    author: '王五',
    avatar: '',
    link: '',
    content: '这是另一条顶级评论。',
    date: '1天前',
    agent: 'Safari 17',
    children: []
  }
]

function getAvatarLetter(name: string) {
  return name?.charAt(0)?.toUpperCase() || '?'
}

function getLinkText(url: string) {
  try {
    return new URL(url).hostname
  } catch {
    return url
  }
}
</script>

<template>
  <div class="comment-list-container">
    <h2 class="comment-title">评论 ({{ demoComments.length }})</h2>

    <ul class="comment-list">
      <li v-for="comment in demoComments" :key="comment.id" class="comment-body">
        <div class="comment-body-inner">
          <!-- 头像区域 -->
          <div class="comment-avatar-box" data-tip="回复">
            <button class="reply-button" title="回复">
              <Icon name="ri-reply-fill" class="size-5" />
            </button>
            <div class="comment-avatar">
              <span class="avatar-letter">{{ getAvatarLetter(comment.author) }}</span>
            </div>
          </div>

          <!-- 评论主体 -->
          <div class="comment-main">
            <!-- 元信息 -->
            <div class="comment-meta">
              <span class="comment-author">{{ comment.author }}</span>
              <a v-if="comment.link" :href="comment.link" class="comment-link" target="_blank" rel="noreferrer noopener nofollow">
                {{ getLinkText(comment.link) }}
              </a>
              <span class="comment-date">{{ comment.date }}</span>
            </div>

            <!-- 评论内容 -->
            <div class="comment-content">
              {{ comment.content }}
            </div>

            <!-- 底部信息 -->
            <div class="comment-information">
              <span data-tip="评论时间">
                <Icon name="ri-time-fill" class="size-3" />
                {{ comment.date }}
              </span>
              <span data-tip="浏览器">
                <Icon name="ri-computer-line" class="size-3" />
                {{ comment.agent }}
              </span>
            </div>
          </div>
        </div>

        <!-- 子评论（嵌套） -->
        <div v-if="comment.children?.length > 0" class="comment-children">
          <ul class="comment-list">
            <li v-for="child in comment.children" :key="child.id" class="comment-body">
              <div class="comment-body-inner">
                <div class="comment-avatar-box" data-tip="回复">
                  <button class="reply-button" title="回复">
                    <Icon name="ri-reply-fill" class="size-4" />
                  </button>
                  <div class="comment-avatar">
                    <span class="avatar-letter">{{ getAvatarLetter(child.author) }}</span>
                  </div>
                </div>

                <div class="comment-main">
                  <div class="comment-meta">
                    <span class="comment-author">{{ child.author }}</span>
                    <a v-if="child.link" :href="child.link" class="comment-link" target="_blank" rel="noreferrer noopener nofollow">
                      {{ getLinkText(child.link) }}
                    </a>
                    <span class="comment-date">{{ child.date }}</span>
                  </div>

                  <div class="comment-content">
                    {{ child.content }}
                  </div>

                  <div class="comment-information">
                    <span data-tip="评论时间">
                      <Icon name="ri-time-fill" class="size-3" />
                      {{ child.date }}
                    </span>
                    <span data-tip="浏览器">
                      <Icon name="ri-computer-line" class="size-3" />
                      {{ child.agent }}
                    </span>
                  </div>
                </div>
              </div>

              <!-- 第三级嵌套 -->
              <div v-if="child.children?.length > 0" class="comment-children">
                <ul class="comment-list">
                  <li v-for="grandchild in child.children" :key="grandchild.id" class="comment-body">
                    <div class="comment-body-inner">
                      <div class="comment-avatar-box" data-tip="回复">
                        <button class="reply-button" title="回复">
                          <Icon name="ri-reply-fill" class="size-4" />
                        </button>
                        <div class="comment-avatar">
                          <span class="avatar-letter">{{ getAvatarLetter(grandchild.author) }}</span>
                        </div>
                      </div>

                      <div class="comment-main">
                        <div class="comment-meta">
                          <span class="comment-author">{{ grandchild.author }}</span>
                          <a v-if="grandchild.link" :href="grandchild.link" class="comment-link" target="_blank" rel="noreferrer noopener nofollow">
                            {{ getLinkText(grandchild.link) }}
                          </a>
                          <span class="comment-date">{{ grandchild.date }}</span>
                        </div>

                        <div class="comment-content">
                          {{ grandchild.content }}
                        </div>

                        <div class="comment-information">
                          <span data-tip="评论时间">
                            <Icon name="ri-time-fill" class="size-3" />
                            {{ grandchild.date }}
                          </span>
                          <span data-tip="浏览器">
                            <Icon name="ri-computer-line" class="size-3" />
                            {{ grandchild.agent }}
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
</template>

<style scoped>
.comment-list-container {
  margin-top: 30px;
}

.comment-title {
  font-size: 1.3em;
  font-weight: 700;
  margin-bottom: 20px;
}

.comment-list {
  list-style: none;
  padding-left: 0;
}

.comment-body {
  list-style: none;
}

.comment-body-inner {
  display: flex;
  margin-bottom: 20px;
}

/* 头像区域 */
.comment-avatar-box {
  display: flex;
  flex: none;
  width: 50px;
  height: 50px;
  position: relative;
  z-index: 1;
}

.comment-avatar {
  width: 100%;
  height: 100%;
  border-radius: 50%;
  border: 1px solid rgb(226 232 240);
  background: rgb(241 245 249);
  display: flex;
  align-items: center;
  justify-content: center;
  overflow: hidden;
}

.dark .comment-avatar {
  border-color: rgb(51 65 85);
  background: rgb(30 41 59);
}

.avatar-letter {
  font-size: 1.25em;
  font-weight: 600;
  color: rgb(100 116 139);
}

.dark .avatar-letter {
  color: rgb(203 213 225);
}

.comment-avatar img {
  width: 100%;
  height: 100%;
  object-fit: cover;
}

/* 回复按钮 */
.reply-button {
  position: absolute;
  inset: 0;
  border-radius: 50%;
  border: 1px solid rgb(226 232 240);
  background: transparent;
  cursor: pointer;
  font-size: 20px;
  display: flex;
  align-items: center;
  justify-content: center;
  opacity: 0;
  transition: all 0.2s;
  z-index: 2;
  color: rgb(100 116 139);
}

.dark .reply-button {
  border-color: rgb(51 65 85);
  color: rgb(203 213 225);
}

.comment-avatar-box:hover .reply-button {
  opacity: 1;
}

.reply-button:hover {
  background: rgb(37 99 235);
  border-color: rgb(37 99 235);
  color: white;
}

/* 评论主体 */
.comment-main {
  margin-left: 15px;
  width: 100%;
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

/* 响应式 */
@media (max-width: 640px) {
  .comment-avatar-box {
    width: 40px;
    height: 40px;
  }

  .comment-main {
    margin-left: 12px;
  }

  .comment-children > .comment-list > .comment-body > .comment-body-inner {
    padding-left: 20px;
  }
}
</style>
