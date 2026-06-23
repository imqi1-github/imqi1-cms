// 全局认证状态
const isLoggedIn = ref(false);
const isLoadingAuth = ref(true);
const currentUser = ref<{
  uid: number;
  name: string;
  nickname: string | null;
  mail: string | null;
  avatar: string | null;
  role: number;
} | null>(null);
let hasInitialized = false;

// 检查用户登录状态
async function checkAuthStatus() {
  if (import.meta.client) {
    try {
      const res = await $fetch('/api/auth/verify') as any;
      isLoggedIn.value = res?.valid || false;
      currentUser.value = res?.valid ? res.user || null : null;
    } catch {
      isLoggedIn.value = false;
      currentUser.value = null;
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
    currentUser: readonly(currentUser),
    hasInitialized: computed(() => hasInitialized),
    checkAuthStatus,
  };
}
