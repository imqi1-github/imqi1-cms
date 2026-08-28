declare global {
  interface Window {
    __BUILD_HASH__?: string;
  }
}

/** 客户端全局暴露构建哈希，便于控制台 / 站点内直接读取。 */
export default defineNuxtPlugin(() => {
  window.__BUILD_HASH__ = useRuntimeConfig().public.buildHash;
});
