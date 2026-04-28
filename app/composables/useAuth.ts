// 全局认证状态
const isLoggedIn = ref(false);
const isLoadingAuth = ref(true);
let hasInitialized = false;

// 检查用户登录状态
async function checkAuthStatus() {
  if (import.meta.client) {
    try {
      const res = await $fetch('/api/auth/verify');
      isLoggedIn.value = (res as any).valid || false;
    } catch {
      isLoggedIn.value = false;
    } finally {
      isLoadingAuth.value = false;
      hasInitialized = true;
    }
  }
}

export function useAuth() {
  return {
    isLoggedIn: readonly(isLoggedIn),
    isLoadingAuth: readonly(isLoadingAuth),
    hasInitialized: computed(() => hasInitialized),
    checkAuthStatus,
  };
}
