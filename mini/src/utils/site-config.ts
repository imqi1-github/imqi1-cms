import type { SiteConfig } from '@/types/site-config'

/**
 * 类型守卫函数，提供 TypeScript 类型推导与 IDE 悬浮提示。
 *
 * 类似 Vite 的 `defineConfig`，确保配置字段符合 {@link SiteConfig} 类型约束。
 */
export function defineSiteConfig(config: SiteConfig): SiteConfig {
  return config
}
