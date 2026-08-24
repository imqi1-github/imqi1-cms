import type { AuthVerifyResponse } from "~/types/apis/auth";

// 全局认证状态
const isLoggedIn = ref(false);
const isLoadingAuth = ref(true);
const currentUser = ref<AuthVerifyResponse["user"]>(null);
const hasInitialized = ref(false);

// 检查用户登录状态
async function checkAuthStatus() {
  if (import.meta.client) {
    try {
      const res = await $fetch('/api/auth/verify');
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

export function useAuth() {
  return {
    isLoggedIn: readonly(isLoggedIn),
    isLoadingAuth: readonly(isLoadingAuth),
    currentUser: readonly(currentUser),
    hasInitialized: readonly(hasInitialized),
    checkAuthStatus,
  };
}
