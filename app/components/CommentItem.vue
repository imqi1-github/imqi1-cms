<script setup lang="ts">
const props = defineProps<{
  comment: any;
  postId: number;
  replyState: {
    isReplying: boolean;
    replyTo: { id: number; name: string } | null;
    targetCommentId: number | null;
  };
  avatarService: string;
  maxLevel: number;
  currentLevel: number;
  commentInterval: number;
  requireMail: boolean;
  requireLink: boolean;
}>();

const emit = defineEmits<{
  (e: "start-reply", comment: any): void;
  (e: "cancel-reply"): void;
  (e: "comment-submitted"): void;
}>();

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

const md5 = (string: string): string => {
  function md5cycle(x: number[], k: number[]) {
    let a = x[0],
      b = x[1],
      c = x[2],
      d = x[3];
    a = ff(a, b, c, d, k[0], 7, -680876936);
    d = ff(d, a, b, c, k[1], 12, -389564586);
    c = ff(c, d, a, b, k[2], 17, 606105819);
    b = ff(b, c, d, a, k[3], 22, -1044525330);
    a = ff(a, b, c, d, k[4], 7, -176418897);
    d = ff(d, a, b, c, k[5], 12, 1200080426);
    c = ff(c, d, a, b, k[6], 17, -1473231341);
    b = ff(b, c, d, a, k[7], 22, -45705983);
    a = ff(a, b, c, d, k[8], 7, 1770035416);
    d = ff(d, a, b, c, k[9], 12, -1958414417);
    c = ff(c, d, a, b, k[10], 17, -42063);
    b = ff(b, c, d, a, k[11], 22, -1990404162);
    a = ff(a, b, c, d, k[12], 7, 1804603682);
    d = ff(d, a, b, c, k[13], 12, -40341101);
    c = ff(c, d, a, b, k[14], 17, -1502002290);
    b = ff(b, c, d, a, k[15], 22, 1236535329);
    a = gg(a, b, c, d, k[1], 5, -165796510);
    d = gg(d, a, b, c, k[6], 9, -1069501632);
    c = gg(c, d, a, b, k[11], 14, 643717713);
    b = gg(b, c, d, a, k[0], 20, -373897302);
    a = gg(a, b, c, d, k[5], 5, -701558691);
    d = gg(d, a, b, c, k[10], 9, 38016083);
    c = gg(c, d, a, b, k[15], 14, -660478335);
    b = gg(b, c, d, a, k[4], 20, -405537848);
    a = gg(a, b, c, d, k[9], 5, 568446438);
    d = gg(d, a, b, c, k[14], 9, -1019803690);
    c = gg(c, d, a, b, k[3], 14, -187363961);
    b = gg(b, c, d, a, k[8], 20, 1163531501);
    a = gg(a, b, c, d, k[13], 5, -1444681467);
    d = gg(d, a, b, c, k[2], 9, -51403784);
    c = gg(c, d, a, b, k[7], 14, 1735328473);
    b = gg(b, c, d, a, k[12], 20, -1926607734);
    a = hh(a, b, c, d, k[5], 4, -378558);
    d = hh(d, a, b, c, k[8], 11, -2022574463);
    c = hh(c, d, a, b, k[11], 16, 1839030562);
    b = hh(b, c, d, a, k[14], 23, -35309556);
    a = hh(a, b, c, d, k[1], 4, -1530992060);
    d = hh(d, a, b, c, k[4], 11, 1272893353);
    c = hh(c, d, a, b, k[7], 16, -155497632);
    b = hh(b, c, d, a, k[10], 23, -1094730640);
    a = hh(a, b, c, d, k[13], 4, 681279174);
    d = hh(d, a, b, c, k[0], 11, -358537222);
    c = hh(c, d, a, b, k[3], 16, -722521979);
    b = hh(b, c, d, a, k[6], 23, 76029189);
    a = hh(a, b, c, d, k[9], 4, -640364487);
    d = hh(d, a, b, c, k[12], 11, -421815835);
    c = hh(c, d, a, b, k[15], 16, 530742520);
    b = hh(b, c, d, a, k[2], 23, -995338651);
    a = ii(a, b, c, d, k[0], 6, -198630844);
    d = ii(d, a, b, c, k[7], 10, 1126891415);
    c = ii(c, d, a, b, k[14], 15, -1416354905);
    b = ii(b, c, d, a, k[5], 21, -57434055);
    a = ii(a, b, c, d, k[12], 6, 1700485571);
    d = ii(d, a, b, c, k[3], 10, -1894986606);
    c = ii(c, d, a, b, k[10], 15, -1051523);
    b = ii(b, c, d, a, k[1], 21, -2054922799);
    a = ii(a, b, c, d, k[8], 6, 1873313359);
    d = ii(d, a, b, c, k[15], 10, -30611744);
    c = ii(c, d, a, b, k[6], 15, -1560198380);
    b = ii(b, c, d, a, k[13], 21, 1309151649);
    a = ii(a, b, c, d, k[4], 6, -145523070);
    d = ii(d, a, b, c, k[11], 10, -1120210379);
    c = ii(c, d, a, b, k[2], 15, 718787259);
    b = ii(b, c, d, a, k[9], 21, -343485551);
    x[0] = add32(a, x[0]);
    x[1] = add32(b, x[1]);
    x[2] = add32(c, x[2]);
    x[3] = add32(d, x[3]);
  }

  function cmn(q: number, a: number, b: number, x: number, s: number, t: number) {
    a = add32(add32(a, q), add32(x, t));
    return add32((a << s) | (a >>> (32 - s)), b);
  }

  function ff(a: number, b: number, c: number, d: number, x: number, s: number, t: number) {
    return cmn((b & c) | (~b & d), a, b, x, s, t);
  }

  function gg(a: number, b: number, c: number, d: number, x: number, s: number, t: number) {
    return cmn((b & d) | (c & ~d), a, b, x, s, t);
  }

  function hh(a: number, b: number, c: number, d: number, x: number, s: number, t: number) {
    return cmn(b ^ c ^ d, a, b, x, s, t);
  }

  function ii(a: number, b: number, c: number, d: number, x: number, s: number, t: number) {
    return cmn(c ^ (b | ~d), a, b, x, s, t);
  }

  function md51(s: string) {
    const n = s.length;
    const state = [1732584193, -271733879, -1732584194, 271733878];
    let i;
    for (i = 64; i <= s.length; i += 64) {
      md5cycle(state, md5blk(s.substring(i - 64, i)));
    }
    s = s.substring(i - 64);
    const tail = [0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0];
    for (i = 0; i < s.length; i++) tail[i >> 2] |= s.charCodeAt(i) << ((i % 4) << 3);
    tail[i >> 2] |= 0x80 << ((i % 4) << 3);
    if (i > 55) {
      md5cycle(state, tail);
      for (i = 0; i < 16; i++) tail[i] = 0;
    }
    tail[14] = n * 8;
    md5cycle(state, tail);
    return state;
  }

  function md5blk(s: string) {
    const md5blks = [];
    for (let i = 0; i < 64; i += 4) {
      md5blks[i >> 2] = s.charCodeAt(i) + (s.charCodeAt(i + 1) << 8) + (s.charCodeAt(i + 2) << 16) + (s.charCodeAt(i + 3) << 24);
    }
    return md5blks;
  }

  const hex_chr = "0123456789abcdef".split("");

  function rhex(n: number) {
    let s = "";
    for (let j = 0; j < 4; j++) s += hex_chr[(n >> (j * 8 + 4)) & 0x0f] + hex_chr[(n >> (j * 8)) & 0x0f];
    return s;
  }

  function hex(x: number[]) {
    for (let i = 0; i < x.length; i++) x[i] = rhex(x[i]);
    return x.join("");
  }

  function add32(a: number, b: number) {
    return (a + b) & 0xffffffff;
  }

  return hex(md51(string));
};

const getAvatarUrl = (email: string | null | undefined): string | null => {
  if (!email) return null;
  const hash = md5(email.toLowerCase().trim());
  const service = props.avatarService || "gravatar";
  const serviceUrls: Record<string, string> = {
    gravatar: "https://www.gravatar.com/avatar",
    cravatar: "https://cravatar.cn/avatar",
    weavatar: "https://weavatar.com/avatar",
  };
  const baseUrl = serviceUrls[service] || serviceUrls.gravatar;
  return `${baseUrl}/${hash}?d=identicon&s=80`;
};

const avatarUrl = computed(() => getAvatarUrl(props.comment.mail));

const canReply = computed(() => {
  return props.maxLevel > 0 && props.currentLevel < props.maxLevel;
});

function startReply(comment: any) {
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
  <li>
    <div class="flex gap-3">
      <!-- 头像区域 -->
      <div class="relative w-10 h-10 flex-shrink-0">
        <button
          v-if="canReply"
          class="absolute top-[-6px] right-[-6px] bg-white dark:bg-slate-800 border border-gray-200 dark:border-gray-700 rounded-full w-5 h-5 flex items-center justify-center cursor-pointer text-gray-500 dark:text-gray-400 transition-all hover:text-blue-600 hover:scale-110"
          title="回复"
          @click="startReply(comment)">
          <Icon name="ri-reply-fill" class="size-4" />
        </button>
        <img
          v-if="avatarUrl"
          :src="avatarUrl"
          :alt="comment.name"
          class="w-10 h-10 rounded-full flex-shrink-0 object-cover bg-slate-100 dark:bg-slate-700"
          loading="lazy" />
        <div
          v-else
          class="w-10 h-10 rounded-full bg-slate-100 dark:bg-slate-700 flex items-center justify-center font-semibold text-lg text-slate-700 dark:text-slate-300 flex-shrink-0">
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
            :href="comment.link"
            class="text-xs text-slate-500 dark:text-slate-400 hover:text-blue-600 transition-colors no-underline"
            target="_blank"
            rel="noreferrer noopener nofollow">
            {{ getLinkText(comment.link) }}
          </a>
        </div>

        <!-- 评论内容 -->
        <div class="line-clamp-2 leading-relaxed my-2 text-slate-700 dark:text-slate-300">
          <EmojiParser :content="comment.content" />
        </div>

        <!-- 底部信息 -->
        <div class="inline-flex items-center gap-1.5 px-2 py-1 bg-slate-100 dark:bg-slate-800 rounded text-xs text-slate-500 dark:text-slate-400">
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
    <div v-if="replyState.isReplying && replyState.targetCommentId === comment.coid" class="mt-4 pt-4 border-t border-gray-200 dark:border-gray-800">
      <CommentInput
        :post-id="postId"
        :is-reply="true"
        :reply-to="replyState.replyTo"
        :comment-interval="commentInterval"
        :require-mail="requireMail"
        :require-link="requireLink"
        @cancel-reply="cancelReply"
        @comment-submitted="handleCommentSubmitted" />
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
          :avatar-service="avatarService"
          :max-level="maxLevel"
          :current-level="currentLevel + 1"
          :comment-interval="commentInterval"
          :require-mail="requireMail"
          :require-link="requireLink"
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
