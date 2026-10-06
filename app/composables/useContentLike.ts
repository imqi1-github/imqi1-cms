import { computed, onMounted, ref } from "vue";

import type {
  ContentLikeState,
  LikeStateResponse,
  LikeToggleResponse,
} from "~/types/apis/content/likes";

/**
 * 文章点赞 composable。
 *
 * 用法（详情页 onMounted 后）：
 *   const like = useContentLike(content.cid, ssrLiked, ssrCount);
 *   await like.refresh();        // 客户端取最新值（SSR 注入的 liked 可能因 IP 变化失真）
 *   await like.like();           // 用户点赞
 *
 * 状态语义：
 *   - count  : 服务端为准，本地仅作乐观占位 + 失败回滚
 *   - liked  : 三路合流：服务端 liked ∧ localStorage 标记 ∨ 刚发起的 pending.like
 *   - pending: 防双击，行为与 LocalStorage 双重幂等
 *   - error  : 上一次失败原因（toast 展示），成功或下一次调用清空
 *
 * localStorage 角色：
 *   - 防服务端 IP 漂移丢状态（同一访客换 IP/UA 后服务端 liked 会判 false，但本地记录了「我点过」）
 *   - 不参与计数，仅作 liked 标记
 *
 * 安全：失败时不修改 localStorage（保守），避免乐观成功但服务端拒绝时本地留下 liked=true。
 */

const STORAGE_PREFIX = "imqi1:liked:";

function storageKey(cid: number): string {
  return `${STORAGE_PREFIX}${cid}`;
}

function readLocalLiked(cid: number): boolean {
  if (typeof window === "undefined") return false;
  try {
    return window.localStorage.getItem(storageKey(cid)) === "true";
  } catch {
    return false;
  }
}

function writeLocalLiked(cid: number, liked: boolean): void {
  if (typeof window === "undefined") return;
  try {
    if (liked) {
      window.localStorage.setItem(storageKey(cid), "true");
    } else {
      window.localStorage.removeItem(storageKey(cid));
    }
  } catch {
    // localStorage 满 / 禁用 → 静默：不影响计数正确性，只会让 liked 闪回会丢
  }
}

export function useContentLike(
  cid: number,
  initialLiked: boolean,
  initialCount: number,
) {
  const count = ref(initialCount);
  // liked 服务端值仅作初值：客户端首帧后再合流 localStorage（防 IP 漂移丢）
  const liked = ref(initialLiked);
  const pending = ref(false);
  const error = ref<string | null>(null);
  // 触发 burst 动画的脉冲：每次 like 调用 +1，组件 watch 后播动画
  const burstKey = ref(0);

  // 客户端首帧后：用 localStorage 合流 liked；count 留待 refresh() 走服务端拉
  onMounted(() => {
    if (readLocalLiked(cid)) liked.value = true;
  });

  /**
   * 客户端拉一次最新状态：用于详情页进入后纠正 SSR 时 IP 不稳导致的 liked 漂移。
   * 失败静默（保持 SSR 注入值），不打扰读者。
   */
  async function refresh(): Promise<void> {
    if (typeof window === "undefined") return;
    try {
      const res = await $fetch<LikeStateResponse>(`/api/contents/likes/${cid}`);
      if (res.success && res.data) {
        // count 始终以服务端为准；liked 取服务端 ∨ localStorage 的并集（保守）
        count.value = res.data.count;
        liked.value = res.data.liked || readLocalLiked(cid);
      }
    } catch {
      // 静默失败，保持 SSR 值
    }
  }

  /**
   * 用户点赞。重复点击幂等：liked=true 或 pending=true 直接 return。
   * 失败回滚乐观值 + 不写 localStorage（保守，下次 refresh() 会再纠）。
   */
  async function like(): Promise<void> {
    if (liked.value || pending.value) return;
    pending.value = true;
    error.value = null;

    const prevCount = count.value;
    // 乐观更新 +1 + liked=true，触发 burst 动画
    count.value = prevCount + 1;
    liked.value = true;
    burstKey.value += 1;
    writeLocalLiked(cid, true);

    try {
      const res = await $fetch<LikeToggleResponse>(`/api/contents/likes/${cid}`, {
        method: "POST",
      });
      if (res.success && res.data) {
        // 服务端为准；created=false 表示重复点击，count 应不变
        count.value = res.data.count;
        liked.value = res.data.liked;
      }
    } catch (e) {
      // 回滚到调用前
      count.value = prevCount;
      liked.value = readLocalLiked(cid) && prevCount > 0 ? liked.value : false;
      error.value = e instanceof Error ? e.message : "点赞失败";
    } finally {
      pending.value = false;
    }
  }

  const state = computed<ContentLikeState>(() => ({
    count: count.value,
    liked: liked.value,
    pending: pending.value,
    error: error.value,
  }));

  return {
    state,
    count,
    liked,
    pending,
    burstKey,
    error,
    refresh,
    like,
  };
}