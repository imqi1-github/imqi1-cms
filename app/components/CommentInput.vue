<script setup lang="ts">
import { onMounted, watch } from "vue";

// 导入前台通知 composable
const { success, error: showError } = useFrontNotification();

// 导入表情数据
import emojisData from "~/assets/emojis.json";

const props = defineProps<{
  postId: number;
  isReply?: boolean;
  replyTo?: {
    id: number;
    name: string;
  };
  commentInterval?: number;
  requireMail?: boolean;
  requireLink?: boolean;
  formData?: {
    content: string;
    name: string;
    mail: string;
    link: string;
  };
}>();

const emit = defineEmits<{
  (e: "cancel-reply"): void;
  (e: "comment-submitted"): void;
}>();

const submitting = ref(false);
const showEmoji = ref(false);
const submitError = ref("");

// 反垃圾：蜜罐字段（人类不可见，机器人会自动填充）
const honeypot = ref("");

// 反垃圾：页面加载时间戳（提交太快说明是机器人）
const pageLoadTime = Date.now();

// 反垃圾：图形验证码（未登录用户需填写，登录用户免验证）
const captchaInput = ref("");
const captchaUrl = ref("");

// 刷新验证码图片（附时间戳避免浏览器缓存）
function refreshCaptcha() {
  captchaUrl.value = `/api/captcha/image?t=${Date.now()}`;
  captchaInput.value = "";
}

// CSRF Token
const csrfToken = ref("");

// 用户登录状态
const isLoggedIn = ref(false);

// 表单数据 - 如果传入了 formData 就使用它，否则创建本地状态
const localFormData = ref({
  content: "",
  name: "",
  mail: "",
  link: "",
});

// 使用 computed 来统一访问，避免在代码中到处判断
const formData = computed({
  get: () => props.formData || localFormData.value,
  set: value => {
    if (props.formData) {
      // 逐个属性修改，保持响应性
      if (value.content !== undefined) props.formData.content = value.content;
      if (value.name !== undefined) props.formData.name = value.name;
      if (value.mail !== undefined) props.formData.mail = value.mail;
      if (value.link !== undefined) props.formData.link = value.link;
    } else {
      // 修改本地状态
      localFormData.value = value;
    }
  },
});

// 表情相关
const activeCategory = ref("capoo");

// 表情分类配置
const categoryConfig: Record<string, { name: string; prefix: string }> = {
  "Heo-Sticker": { name: "Heo表情", prefix: "heo-" },
  capoo: { name: "猫猫虫", prefix: "猫猫虫-" },
  Cat: { name: "猫咪", prefix: "cat-" },
};

// 当前分类的表情列表
const currentEmojis = computed(() => {
  const category = activeCategory.value;
  const config = categoryConfig[category];
  if (!config) return [];

  const emojis = emojisData[category as keyof typeof emojisData];
  if (!emojis) return [];

  return Object.entries(emojis).map(([key, path]) => ({
    key,
    path: publicAsset(path), // 生产环境且配置了 CDN 时自动加前缀
    name: key.replace(config.prefix, ""),
  }));
});

// 所有分类
const categories = computed(() => {
  return Object.keys(emojisData).map(key => ({
    key,
    name: categoryConfig[key]?.name || key,
  }));
});

// Textarea 引用
const textareaRef = ref<HTMLTextAreaElement>();

// 初始化表单数据
onMounted(async () => {
  if (import.meta.client) {
    try {
      // 并行获取用户信息、站点设置和 CSRF token
      const [userRes, settingsRes, csrfRes] = await Promise.allSettled([
        $fetch("/api/user", { credentials: "include" }),
        $fetch("/api/settings"),
        $fetch("/api/csrf/token", { credentials: "include" }),
      ]);

      // 获取 CSRF token
      if (csrfRes.status === "fulfilled" && csrfRes.value?.data?.token) {
        csrfToken.value = csrfRes.value.data.token;
      }

      // 处理用户信息
      if (userRes.status === "fulfilled" && userRes.value?.user) {
        const user = userRes.value.user;
        isLoggedIn.value = true;
        formData.value.name = user.nickname || user.name || "";
        formData.value.mail = user.mail || "";
      } else {
        // 未登录，从localStorage读取
        const savedName = localStorage.getItem("comment_name");
        const savedMail = localStorage.getItem("comment_mail");
        const savedLink = localStorage.getItem("comment_link");

        if (savedName) formData.value.name = savedName;
        if (savedMail) formData.value.mail = savedMail;
        if (savedLink) formData.value.link = savedLink;
      }

      // 加载保存的评论内容
      const savedContent = localStorage.getItem("comment_content");
      if (savedContent) {
        formData.value.content = savedContent;
      }

      // 处理站点设置（获取链接）
      if (settingsRes.status === "fulfilled" && settingsRes.value?.siteUrl) {
        // 如果已登录，自动填充站点链接
        if (isLoggedIn.value) {
          formData.value.link = settingsRes.value.siteUrl;
        }
      }
    } catch {
      // 出错时从localStorage读取
      const savedName = localStorage.getItem("comment_name");
      const savedMail = localStorage.getItem("comment_mail");
      const savedLink = localStorage.getItem("comment_link");

      if (savedName) formData.value.name = savedName;
      if (savedMail) formData.value.mail = savedMail;
      if (savedLink) formData.value.link = savedLink;

      // 加载保存的评论内容
      const savedContent = localStorage.getItem("comment_content");
      if (savedContent) {
        formData.value.content = savedContent;
      }
    }

    // 未登录用户加载图形验证码
    if (!isLoggedIn.value) {
      refreshCaptcha();
    }
  }
});

// 监听评论内容变化，自动保存到 localStorage
watch(
  () => formData.value.content,
  newContent => {
    if (import.meta.client) {
      if (newContent.trim()) {
        localStorage.setItem("comment_content", newContent);
      } else {
        localStorage.removeItem("comment_content");
      }
    }
  },
  { deep: true },
);

// 取消回复
function cancelReply() {
  emit("cancel-reply");
}

// 提交评论
async function submitComment() {
  // 重置状态
  submitError.value = "";

  // 反垃圾：蜜罐检测（机器人会自动填充隐藏字段）
  if (honeypot.value) {
    submitError.value = "提交失败";
    return;
  }

  // 反垃圾：时间检测（提交太快说明是机器人，5秒内提交视为异常）
  if (Date.now() - pageLoadTime < 5000) {
    submitError.value = "操作太快，请稍后再试";
    showError("操作太快，请稍后再试");
    return;
  }

  // 反垃圾：图形验证码（登录用户免验证）
  if (!isLoggedIn.value && !captchaInput.value.trim()) {
    submitError.value = "请输入验证码";
    showError("请输入验证码");
    return;
  }

  // 检查评论间隔
  if (import.meta.client && props.commentInterval && props.commentInterval > 0) {
    const lastCommentTime = localStorage.getItem("last_comment_time");
    if (lastCommentTime) {
      const elapsed = Date.now() - parseInt(lastCommentTime);
      const remaining = props.commentInterval * 1000 - elapsed;
      if (remaining > 0) {
        const remainingSeconds = Math.ceil(remaining / 1000);
        submitError.value = `评论太频繁，请 ${remainingSeconds} 秒后再试`;
        showError(`评论太频繁，请 ${remainingSeconds} 秒后再试`);
        return;
      }
    }
  }

  // 验证必填项
  if (!formData.value.content.trim()) {
    submitError.value = "请输入评论内容";
    showError("请输入评论内容");
    return;
  }

  if (!formData.value.name.trim()) {
    submitError.value = "请输入昵称";
    showError("请输入昵称");
    return;
  }

  if (props.requireMail && !formData.value.mail.trim()) {
    submitError.value = "请输入邮箱";
    showError("请输入邮箱");
    return;
  }

  if (props.requireLink && !formData.value.link.trim()) {
    submitError.value = "请输入链接";
    showError("请输入链接");
    return;
  }

  submitting.value = true;
  try {
    const response: any = await $fetch("/api/comments", {
      method: "POST",
      credentials: "include",
      body: {
        csrfToken: csrfToken.value,
        cid: props.postId,
        content: formData.value.content,
        name: formData.value.name,
        mail: formData.value.mail,
        link: formData.value.link,
        parent_id: props.isReply ? props.replyTo?.id : null,
        website: honeypot.value, // 蜜罐字段
        captcha: captchaInput.value, // 图形验证码（未登录用户）
      },
    });

    // 检查响应状态码
    if (response.code === 200) {
      submitError.value = "";

      // 显示前台通知
      if (response.needModeration) {
        success("评论提交成功，请等待审核");
      } else {
        success("评论提交成功");
      }

      // 保存用户信息到localStorage
      if (import.meta.client) {
        localStorage.setItem("comment_name", formData.value.name);
        if (formData.value.mail) {
          localStorage.setItem("comment_mail", formData.value.mail);
        }
        if (formData.value.link) {
          localStorage.setItem("comment_link", formData.value.link);
        }
        // 记录评论时间
        localStorage.setItem("last_comment_time", Date.now().toString());
        // 清除保存的评论内容
        localStorage.removeItem("comment_content");
      }

      // 重置表单（只重置内容，保留用户信息）
      formData.value.content = "";
      // 验证码已消费，刷新一张新的
      if (!isLoggedIn.value) {
        refreshCaptcha();
      }
      // 通知父组件立即刷新评论列表，让用户马上看到自己的评论（不再延迟 3 秒）
      emit("comment-submitted");
    } else {
      // 处理错误响应（包括429频率限制）
      const errorMsg = response.message || "评论失败，请重试";
      submitError.value = errorMsg;
      // 显示前台错误通知
      showError(errorMsg);
      // 验证码可能已消费，刷新一张
      if (!isLoggedIn.value) {
        refreshCaptcha();
      }
    }
  } catch (error: any) {
    // 提取错误消息 - 网络错误或其他异常
    let errorMessage = "网络错误，请稍后重试";
    if (error?.data?.message) {
      errorMessage = error.data.message;
    } else if (error?.message && !error.message.includes("[POST]")) {
      errorMessage = error.message;
    }

    submitError.value = errorMessage;
    // 显示前台错误通知
    showError(errorMessage);
    console.error("评论失败:", error);
    // 验证码已消费（如校验失败），刷新一张让用户重填
    if (!isLoggedIn.value) {
      refreshCaptcha();
    }
  } finally {
    submitting.value = false;
  }
}

// 在光标位置插入表情
function insertEmoji(key: string) {
  const config = categoryConfig[activeCategory.value];
  const name = key.replace(config?.prefix || "", "");
  // 使用 prefix 生成占位符，例如 :[heo-3d眼镜]、:[猫猫虫-加油]、:[cat-ablobcatattentionreverse]
  const placeholder = `:[${config?.prefix ?? ""}${name}]`;

  const textarea = textareaRef.value;
  if (!textarea) {
    formData.value.content += placeholder;
    return;
  }

  const start = textarea.selectionStart;
  const end = textarea.selectionEnd;
  const text = formData.value.content;

  formData.value.content = text.substring(0, start) + placeholder + text.substring(end);

  // 重新聚焦并设置光标位置
  nextTick(() => {
    const newPosition = start + placeholder.length;
    textarea.setSelectionRange(newPosition, newPosition);
    textarea.focus();
  });
}

// 格式化表情占位符为图片
function formatEmojiPlaceholder(text: string): string {
  // 匹配 :[prefix-name] 格式
  const emojiRegex = /:\[([^\]]+)-([^\]]+)\]/g;

  return text.replace(emojiRegex, (match, prefix, name) => {
    // 通过 prefix 查找对应的 category
    let category: string | null = null;
    for (const [cat, config] of Object.entries(categoryConfig)) {
      if (config.prefix === prefix) {
        category = cat;
        break;
      }
    }

    if (!category) return match;

    const key = prefix + name;
    const emojis = emojisData[category as keyof typeof emojisData] as Record<string, string> | undefined;
    if (!emojis || !emojis[key]) return match;

    return emojis[key]!;
  });
}
</script>

<template>
  <div id="comment-input-box" class="comment-input-box">
    <div class="flex items-center justify-between">
      <h2 class="comment-box-title">
        {{ isReply ? `回复 ${replyTo?.name}` : "评论" }}
      </h2>
      <button v-if="isReply" type="button" @click="cancelReply" class="cancel-reply-button">取消回复</button>
    </div>
    <div class="comment-box-description">
      评论即代表你已阅读并同意<a href="/agreement#评论相关" class="comment-link" target="_blank">评论协议</a>。
    </div>

    <div class="comment-input-row">
      <label for="comment-content-input" class="sr-only">评论内容</label>
      <textarea id="comment-content-input" ref="textareaRef" v-model="formData.content" placeholder="评论内容 *" class="comment-textarea" required />
    </div>

    <!-- 蜜罐字段：人类不可见，机器人会自动填充。
         仅未登录用户渲染——登录用户已通过身份认证，无需蜜罐；且其昵称/邮箱/链接框均被禁用，
         浏览器自动填充找不到可填的字段，会误填这个文本框，导致提交被蜜罐逻辑静默拦截（表现为“点了没反应”）。
         字段名刻意避开 website/url 等浏览器自动填充识别词，防止误填。 -->
    <div v-if="!isLoggedIn" class="hp-field" aria-hidden="true">
      <label for="comment-hp">附加信息</label>
      <input id="comment-hp" v-model="honeypot" type="text" name="hp_field" tabindex="-1" autocomplete="off" />
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
          :disabled="isLoggedIn"
          required />
      </div>
      <div class="comment-input-group">
        <label for="comment-input-mail" class="sr-only">邮箱</label>
        <input
          id="comment-input-mail"
          v-model="formData.mail"
          type="email"
          :placeholder="requireMail ? '邮箱 *' : '邮箱'"
          class="comment-input"
          :disabled="isLoggedIn" />
      </div>
      <div class="comment-input-group">
        <label for="comment-input-link" class="sr-only">链接</label>
        <input
          id="comment-input-link"
          v-model="formData.link"
          type="url"
          :placeholder="requireLink ? '链接 *' : '链接'"
          class="comment-input"
          :disabled="isLoggedIn" />
      </div>
      <!-- 图形验证码（仅未登录用户显示，与昵称/邮箱/链接同行） -->
      <div v-if="!isLoggedIn" class="comment-input-group verify-group">
        <label for="comment-input-captcha" class="sr-only">验证码</label>
        <input
          id="comment-input-captcha"
          v-model="captchaInput"
          type="text"
          placeholder="验证码 *"
          class="comment-input"
          maxlength="6"
          autocomplete="off"
          required />
        <img
          v-if="captchaUrl"
          :src="captchaUrl"
          class="captcha-image"
          alt="验证码"
          title="点击刷新验证码"
          loading="lazy"
          @click="refreshCaptcha" />
      </div>

      <div class="comment-buttons">
        <div class="relative">
          <button type="button" class="emoji-button" @click="showEmoji = !showEmoji" v-tooltip="'表情'">
            <Icon name="ri:emoji-sticker-line" class="size-4" />
          </button>
          <!-- 表情面板 - 悬浮 -->
          <Transition name="emoji">
            <div v-if="showEmoji" class="emoji-box">
              <!-- 分类标签 -->
              <div class="emoji-tabs">
                <button
                  v-for="cat in categories"
                  :key="cat.key"
                  type="button"
                  class="emoji-tab"
                  :class="{ active: activeCategory === cat.key }"
                  @click="activeCategory = cat.key">
                  {{ cat.name }}
                </button>
              </div>
              <!-- 表情列表 -->
              <div class="emoji-list">
                <img
                  v-for="emoji in currentEmojis"
                  :key="emoji.key"
                  :src="emoji.path"
                  :alt="emoji.name"
                  :title="emoji.name"
                  class="emoji-item"
                  @click="insertEmoji(emoji.key)" />
              </div>
            </div>
          </Transition>
        </div>
        <button type="button" class="submit-button" @click="submitComment" :disabled="submitting">
          {{ submitting ? "提交中..." : "提交评论" }}
        </button>
      </div>
    </div>
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
  color: rgb(23, 20, 20);
  resize: vertical;
  transition:
    border-color 0.15s,
    box-shadow 0.15s;
}

.dark .comment-textarea {
  background: rgb(8, 14, 30);
  border-color: rgb(24, 35, 49);
  color: rgb(203 213 225);
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
  color: rgb(23, 20, 20);
  font-size: 0.875em;
  transition:
    border-color 0.15s,
    box-shadow 0.15s;
}

.dark .comment-input {
  background: rgb(8, 14, 30);
  border-color: rgb(24, 35, 49);
  color: rgb(203 213 225);
}

.comment-input:focus {
  outline: none;
  border-color: rgb(37 99 235);
  box-shadow: 0 0 0 3px rgb(37 99 235 / 0.1);
}

.comment-input:disabled {
  background: rgb(243 244 246);
  color: rgb(107 114 128);
  cursor: not-allowed;
}

.dark .comment-input:disabled {
  background: rgb(30 41 59);
  color: rgb(107 114 128);
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
  height: 28px;
  display: flex;
  align-items: center;
  justify-content: center;
  border-radius: 6px;
  cursor: pointer;
  font-size: 0.875em;
  font-weight: 600;
  transition: background-color 0.15s;
}

.emoji-button {
  background: rgb(241 245 249);
  color: rgb(51 65 85);
  padding-inline: 12px;
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
  padding-inline: 12px;
}

.submit-button:hover:not(:disabled) {
  background: rgb(29 78 216);
}

.submit-button:disabled {
  opacity: 0.7;
  cursor: not-allowed;
}

/* 表情面板 - 悬浮样式 */
.emoji-box {
  position: absolute;
  bottom: calc(100% + 8px);
  right: 0;
  z-index: 100;
  width: 320px;
  padding: 8px;
  background: rgb(255 255 255);
  border: 1px solid rgb(226 232 240);
  border-radius: 8px;
  box-shadow: 0 10px 15px -3px rgb(0 0 0 / 0.1);
}

.dark .emoji-box {
  background: rgb(15 23 42);
  border-color: rgb(51 65 85);
}

/* 表情分类标签 */
.emoji-tabs {
  display: flex;
  gap: 4px;
  margin-bottom: 8px;
}

.emoji-tab {
  padding: 4px 10px;
  border: none;
  background: transparent;
  color: rgb(100 116 139);
  cursor: pointer;
  border-radius: 4px;
  font-size: 0.75em;
  transition: all 0.15s;
}

.dark .emoji-tab {
  color: rgb(148 163 184);
}

.emoji-tab.active {
  background: rgb(37 99 235);
  color: white;
}

.emoji-list {
  display: flex;
  flex-wrap: wrap;
  gap: 4px;
  max-height: 180px;
  overflow-y: auto;
}

.emoji-list::-webkit-scrollbar {
  width: 4px;
}

.emoji-list::-webkit-scrollbar-thumb {
  background: rgb(203 213 225);
  border-radius: 2px;
}

.dark .emoji-list::-webkit-scrollbar-thumb {
  background: rgb(71 85 105);
}

.emoji-item {
  width: 32px;
  height: 32px;
  object-fit: contain;
  cursor: pointer;
  padding: 2px;
  border-radius: 4px;
  transition: background 0.15s;
}

.emoji-item:hover {
  background: rgb(241 245 249);
}

.dark .emoji-item:hover {
  background: rgb(30 41 59);
}

/* 表情面板动画 */
.emoji-enter-active,
.emoji-leave-active {
  transition: all 0.15s;
}

.emoji-enter-from,
.emoji-leave-to {
  opacity: 0;
  transform: translateY(-8px);
}

.cancel-reply-button {
  background: none;
  border: none;
  color: rgb(100 116 139);
  font-size: 0.875em;
  cursor: pointer;
  padding: 4px 8px;
  border-radius: 4px;
  transition: background-color 0.15s;
}

.dark .cancel-reply-button {
  color: rgb(148 163 184);
}

.cancel-reply-button:hover {
  background: rgb(241 245 249);
}

.dark .cancel-reply-button:hover {
  background: rgb(30 41 59);
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

/* 蜜罐字段：完全隐藏，机器人会自动填充 */
.hp-field {
  position: absolute;
  left: -9999px;
  top: -9999px;
  width: 1px;
  height: 1px;
  overflow: hidden;
  opacity: 0;
  pointer-events: none;
}

/* 图形验证码样式（验证码输入框 + 图片并排） */
.verify-group {
  display: flex;
  align-items: center;
  gap: 6px;
}

.verify-group .comment-input {
  width: auto;
  flex: 1;
  min-width: 0;
}

.captcha-image {
  height: 28px;
  width: auto;
  flex-shrink: 0;
  border: 1px solid rgb(226 232 240);
  border-radius: 4px;
  cursor: pointer;
  background: rgb(248 250 252);
  transition: opacity 0.15s;
}

.captcha-image:hover {
  opacity: 0.8;
}

.dark .captcha-image {
  border-color: rgb(51 65 85);
}
</style>
