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
const { isLoggedIn, isLoadingAuth, currentUser } = useAuth();
const { siteSettings } = useSiteSettings();
const showGuestFields = computed(() => !isLoadingAuth.value && !isLoggedIn.value);

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

const loggedInDisplayName = computed(() => currentUser.value?.nickname || currentUser.value?.name || formData.value.name || "已登录用户");

// 表情相关
const activeCategory = ref("Heo-Sticker");

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

function fillCommentUserInfo() {
  const user = currentUser.value;
  if (isLoggedIn.value && user) {
    formData.value.name = user.nickname || user.name || "";
    formData.value.mail = user.mail || "";
    formData.value.link = siteSettings.value?.siteUrl || formData.value.link;
    return;
  }

  const savedName = localStorage.getItem("comment_name");
  const savedMail = localStorage.getItem("comment_mail");
  const savedLink = localStorage.getItem("comment_link");

  if (savedName) formData.value.name = savedName;
  if (savedMail) formData.value.mail = savedMail;
  if (savedLink) formData.value.link = savedLink;
}

// 初始化表单数据
onMounted(() => {
  if (import.meta.client) {
    fillCommentUserInfo();

    // 评论框只需要单独获取 CSRF token；登录状态和站点设置复用全局状态。
    $fetch("/api/csrf/token", { credentials: "include" })
      .then((csrfRes: any) => {
        if (csrfRes?.data?.token) {
          csrfToken.value = csrfRes.data.token;
        }
      })
      .catch(() => {
        // 提交时会提示 CSRF token 未通过，初始化阶段静默失败不阻塞表单显示。
      });

    // 加载保存的评论内容
    const savedContent = localStorage.getItem("comment_content");
    if (savedContent) {
      formData.value.content = savedContent;
    }

    // 未登录用户加载图形验证码
    if (showGuestFields.value) {
      refreshCaptcha();
    }
  }
});

watch(
  [() => isLoadingAuth.value, () => isLoggedIn.value, () => currentUser.value, () => siteSettings.value?.siteUrl],
  () => {
    if (!import.meta.client) return;

    fillCommentUserInfo();
    if (showGuestFields.value && !captchaUrl.value) {
      refreshCaptcha();
    }
  },
);

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
  if (showGuestFields.value && !captchaInput.value.trim()) {
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
      if (showGuestFields.value) {
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
      if (showGuestFields.value) {
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
    if (showGuestFields.value) {
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
  <div id="comment-input-box" class="mt-5">
    <div class="flex items-center justify-between">
      <h2 class="mb-1.25 text-[1.3em] font-bold">
        {{ isReply ? `回复 ${replyTo?.name}` : "评论" }}
      </h2>
      <button
        v-if="isReply"
        type="button"
        @click="cancelReply"
        class="cursor-pointer rounded border-0 bg-transparent px-2 py-1 text-[0.875em] text-slate-500 transition-colors hover:bg-slate-100 dark:text-slate-400 dark:hover:bg-slate-800">
        取消回复
      </button>
    </div>
    <div class="mb-3.75 text-[0.875em] text-slate-500">
      评论即代表你已阅读并同意<a href="/agreement#评论相关" class="text-blue-600 underline underline-offset-2 hover:text-blue-700" target="_blank">评论协议</a>。
    </div>

    <div class="mb-2.5 flex w-full flex-wrap gap-2.5">
      <label for="comment-content-input" class="sr-only">评论内容</label>
      <textarea
        id="comment-content-input"
        ref="textareaRef"
        v-model="formData.content"
        placeholder="评论内容 *"
        class="min-h-[10em] w-full resize-y rounded border border-slate-200 bg-white px-3 py-2 leading-normal text-[rgb(23,20,20)] transition-[border-color,box-shadow] duration-150 focus:border-blue-600 hover:border-blue-600 focus:outline-none dark:border-[rgb(24,35,49)] dark:bg-[rgb(8,14,30)] dark:text-slate-300"
        required />
    </div>

    <!-- 蜜罐字段：仅未登录用户渲染。
         人类不可见且不可聚焦；正常用户/浏览器自动填充应填写昵称、邮箱、链接等可见字段，
         但简单机器人可能会无差别填充隐藏 input，从而被蜜罐拦截。
         登录用户已通过身份认证，无需蜜罐；同时避免自动填充/密码管理器误填蜜罐导致提交被拦截。
         字段名刻意避开 website/url 等自动填充关键词，降低误填概率。 -->
    <div v-if="showGuestFields" class="pointer-events-none absolute -left-2499.75 -top-2499.75 size-px overflow-hidden opacity-0" aria-hidden="true">
      <label for="comment-hp">附加信息</label>
      <input id="comment-hp" v-model="honeypot" type="text" name="hp_field" tabindex="-1" autocomplete="off" />
    </div>

    <div class="mb-2.5 flex w-full flex-wrap gap-2.5">
      <template v-if="isLoggedIn">
        <input v-model="formData.name" type="hidden" name="name" />
        <input v-model="formData.mail" type="hidden" name="mail" />
        <input v-model="formData.link" type="hidden" name="link" />
        <div class="flex h-8 flex-1 items-center gap-2 text-[0.875em] text-slate-700 dark:text-slate-300">
          <span class="overflow-hidden text-ellipsis whitespace-nowrap">已登录用户：</span>
          <img
            v-if="currentUser?.avatar"
            :src="currentUser.avatar"
            :alt="loggedInDisplayName"
            class="size-5.5 shrink-0 rounded-full border border-[rgb(229,224,224)] bg-slate-200 object-cover" />
        </div>
      </template>
      <template v-else-if="showGuestFields">
        <div class="min-w-37.5 flex-1 max-sm:min-w-full">
          <label for="comment-input-name" class="sr-only">昵称</label>
          <input
            id="comment-input-name"
            v-model="formData.name"
            type="text"
            placeholder="昵称 *"
            class="h-8 w-full rounded border border-slate-200 bg-white px-2.5 py-1 text-[0.875em] text-[rgb(23,20,20)] transition-[border-color,box-shadow] duration-150 hover:border-blue-600 focus:border-blue-600 focus:outline-none disabled:cursor-not-allowed disabled:bg-gray-100 disabled:text-gray-500 dark:border-[rgb(24,35,49)] dark:bg-[rgb(8,14,30)] dark:text-slate-300 dark:disabled:bg-slate-800 dark:disabled:text-gray-500"
            required />
        </div>
        <div class="min-w-37.5 flex-1 max-sm:min-w-full">
          <label for="comment-input-mail" class="sr-only">邮箱</label>
          <input
            id="comment-input-mail"
            v-model="formData.mail"
            type="email"
            :placeholder="requireMail ? '邮箱 *' : '邮箱'"
            class="h-8 w-full rounded border border-slate-200 bg-white px-2.5 py-1 text-[0.875em] text-[rgb(23,20,20)] transition-[border-color,box-shadow] duration-150 hover:border-blue-600 focus:border-blue-600 focus:outline-none disabled:cursor-not-allowed disabled:bg-gray-100 disabled:text-gray-500 dark:border-[rgb(24,35,49)] dark:bg-[rgb(8,14,30)] dark:text-slate-300 dark:disabled:bg-slate-800 dark:disabled:text-gray-500" />
        </div>
        <div class="min-w-37.5 flex-1 max-sm:min-w-full">
          <label for="comment-input-link" class="sr-only">链接</label>
          <input
            id="comment-input-link"
            v-model="formData.link"
            type="url"
            :placeholder="requireLink ? '链接 *' : '链接'"
            class="h-8 w-full rounded border border-slate-200 bg-white px-2.5 py-1 text-[0.875em] text-[rgb(23,20,20)] transition-[border-color,box-shadow] duration-150 hover:border-blue-600 focus:border-blue-600 focus:outline-none disabled:cursor-not-allowed disabled:bg-gray-100 disabled:text-gray-500 dark:border-[rgb(24,35,49)] dark:bg-[rgb(8,14,30)] dark:text-slate-300 dark:disabled:bg-slate-800 dark:disabled:text-gray-500" />
        </div>
      </template>
      <!-- 图形验证码（仅未登录用户显示，与昵称/邮箱/链接同行） -->
      <div v-if="showGuestFields" class="flex min-w-37.5 flex-1 items-center gap-1.5 max-sm:min-w-full">
        <label for="comment-input-captcha" class="sr-only">验证码</label>
        <input
          id="comment-input-captcha"
          v-model="captchaInput"
          type="text"
          placeholder="验证码 *"
          class="h-8 min-w-0 flex-1 rounded border border-slate-200 bg-white px-2.5 py-1 text-[0.875em] text-[rgb(23,20,20)] transition-[border-color,box-shadow] duration-150 hover:border-blue-600 focus:border-blue-600 focus:outline-none disabled:cursor-not-allowed disabled:bg-gray-100 disabled:text-gray-500 dark:border-[rgb(24,35,49)] dark:bg-[rgb(8,14,30)] dark:text-slate-300 dark:disabled:bg-slate-800 dark:disabled:text-gray-500"
          maxlength="6"
          autocomplete="off"
          required />
        <img
          v-if="captchaUrl"
          :src="captchaUrl"
          class="h-7 w-auto shrink-0 cursor-pointer rounded border border-slate-200 bg-slate-50 transition-opacity duration-150 hover:opacity-80 dark:border-slate-600"
          alt="验证码"
          title="点击刷新验证码"
          loading="lazy"
          @click="refreshCaptcha" />
      </div>

      <div class="ml-auto flex items-center gap-2 max-sm:ml-0 max-sm:w-full max-sm:justify-end">
        <div class="relative">
          <button
            type="button"
            class="flex h-7 cursor-pointer items-center justify-center rounded-md border-0 bg-slate-100 px-3 text-[0.875em] font-semibold text-slate-700 transition-colors hover:bg-slate-200 dark:bg-slate-800 dark:text-slate-300 dark:hover:bg-slate-700"
            @click="showEmoji = !showEmoji"
            v-tooltip="'表情'">
            <Icon name="ri:emoji-sticker-line" class="size-4" />
          </button>
          <!-- 表情面板 - 悬浮 -->
          <Transition
            enter-active-class="transition-all duration-150"
            leave-active-class="transition-all duration-150"
            enter-from-class="opacity-0 -translate-y-2"
            leave-to-class="opacity-0 -translate-y-2">
            <div v-if="showEmoji" class="absolute right-0 bottom-[calc(100%+8px)] z-100 w-80 rounded-lg border border-slate-200 bg-white p-2 shadow-lg dark:border-slate-700 dark:bg-slate-900">
              <!-- 分类标签 -->
              <div class="mb-2 flex gap-1">
                <button
                  v-for="cat in categories"
                  :key="cat.key"
                  type="button"
                  class="cursor-pointer rounded border-0 px-2.5 py-1 text-[0.75em] text-slate-500 transition-all duration-150 dark:text-slate-400"
                  :class="{ 'bg-blue-500 text-white dark:text-white': activeCategory === cat.key }"
                  @click="activeCategory = cat.key">
                  {{ cat.name }}
                </button>
              </div>
              <!-- 表情列表 -->
              <div class="flex max-h-45 flex-wrap gap-1 overflow-y-auto [&::-webkit-scrollbar-thumb]:rounded-sm [&::-webkit-scrollbar-thumb]:bg-slate-300 dark:[&::-webkit-scrollbar-thumb]:bg-slate-600 [&::-webkit-scrollbar]:w-1">
                <img
                  v-for="emoji in currentEmojis"
                  :key="emoji.key"
                  :src="emoji.path"
                  :alt="emoji.name"
                  :title="emoji.name"
                  class="size-8 cursor-pointer rounded p-0.5 object-contain transition-colors duration-150 hover:bg-slate-100 dark:hover:bg-slate-800"
                  @click="insertEmoji(emoji.key)" />
              </div>
            </div>
          </Transition>
        </div>
        <button
          type="button"
          class="flex h-7 cursor-pointer items-center justify-center rounded-md border-0 bg-blue-600 px-3 text-[0.875em] font-semibold text-white transition-colors hover:bg-blue-700 disabled:cursor-not-allowed disabled:opacity-70"
          @click="submitComment"
          :disabled="submitting">
          {{ submitting ? "提交中..." : "提交评论" }}
        </button>
      </div>
    </div>
  </div>
</template>
