import type { AuthVerifyResponse } from "~/types/apis/auth";

// 全局认证状态 —— 用 useState（而非模块级 ref）：与 useAudioPlayer/useSiteSettings 一致，
// 避免 SSR 长驻进程中模块级 ref 被多请求串号。checkAuthStatus 虽被 import.meta.client 门控，
// 但任何未来的服务端变异若未走该门控会跨请求泄漏，useState 可隔离。
export function useAuth() {
  const isLoggedIn = useState<boolean>("auth:isLoggedIn", () => false);
  const isLoadingAuth = useState<boolean>("auth:isLoadingAuth", () => true);
  const currentUser = useState<AuthVerifyResponse["user"] | null>("auth:currentUser", () => null);
  const hasInitialized = useState<boolean>("auth:hasInitialized", () => false);

  // 检查用户登录状态
  async function checkAuthStatus() {
    if (import.meta.client) {
      try {
        const res = await $fetch("/api/auth/verify");
        isLoggedIn.value = res?.valid || false;
        currentUser.value = res?.valid ? res.user || null : null;
      } catch {
        isLoggedIn.value = false;
        currentUser.value = null;
      } finally {
        isLoadingAuth.value = false;
        hasInitialized.value = true;
      }
    }
  }

  return {
    isLoggedIn: readonly(isLoggedIn),
    isLoadingAuth: readonly(isLoadingAuth),
    currentUser: readonly(currentUser),
    hasInitialized: readonly(hasInitialized),
    checkAuthStatus,
  };
}
