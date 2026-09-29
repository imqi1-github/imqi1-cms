declare module "#build/pwa-icons/pwa-icons" {
  export interface PWAIcons {
    transparent: Record<string, unknown>;
    maskable: Record<string, unknown>;
    favicon: Record<string, unknown>;
    apple: Record<string, unknown>;
    appleSplashScreen: Record<string, unknown>;
  }
}

declare module "#imports" {
  // 仅兜底 pwa-icons-plugin.ts 的 import { defineNuxtPlugin } from '#imports',
  // 真实类型由 .nuxt/types/imports.d.ts 在 app/server tsconfig 下提供。
  export const defineNuxtPlugin: (...args: unknown[]) => unknown;
}
