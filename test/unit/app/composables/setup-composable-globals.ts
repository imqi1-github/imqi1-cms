/**
 * 在 composable 测试前注入 Nuxt/Vue auto-import stubs。
 * 通过 bun-preload.ts 的 Bun.plugin 在 test/app/composables/*.test.ts 首行 import 它。
 */
import { computed, onBeforeUnmount, onMounted, onUnmounted, readonly, reactive, ref, shallowRef, watch } from "vue";

const stateMap = new Map<string, { value: unknown }>();

function useState<T>(key: string, init?: () => T): { value: T } {
  let entry = stateMap.get(key);
  if (!entry) { entry = { value: init ? init() : null } as { value: T }; stateMap.set(key, entry); }
  return entry as { value: T };
}

function useNuxtApp(): { isHydrating: boolean; payload: Record<string, unknown> } {
  return { isHydrating: false, payload: {} };
}

function useRoute(): { fullPath: string; path: string; params: Record<string, string>; query: Record<string, string> } {
  return { fullPath: "/test", path: "/test", params: {}, query: {} };
}

function navigateTo(): Promise<void> { return Promise.resolve(); }
function $fetch<T = unknown>(): Promise<T> { return Promise.resolve(undefined as T); }

const globals: Record<string, unknown> = {
  useState, useNuxtApp, useRoute, navigateTo, $fetch,
  ref, computed, watch, reactive, readonly, shallowRef,
  onMounted, onUnmounted, onBeforeUnmount,
  inject: () => undefined, provide: () => {},
};

for (const [k, v] of Object.entries(globals)) {
  // writable=true 让 mock 测试可覆盖;configurable=true 让 vi.mock 链与 plugin 重定义不出错
  Object.defineProperty(globalThis, k, { value: v, writable: true, configurable: true });
}

// localStorage / CSS / HTMLElement
const _storage = new Map<string, string>();
Object.defineProperty(globalThis, "localStorage", {
  value: {
    getItem: (k: string) => _storage.get(k) ?? null,
    setItem: (k: string, v: string) => { _storage.set(k, v); },
    removeItem: (k: string) => { _storage.delete(k); },
    clear: () => _storage.clear(),
    key: (i: number) => [..._storage.keys()][i] ?? null,
    get length() { return _storage.size; },
  },
  writable: true, configurable: true,
});
Object.defineProperty(globalThis, "CSS", { value: { escape: (s: string) => s.replace(/["\\]/g, "\\$&") }, writable: true, configurable: true });
// eslint-disable-next-line @typescript-eslint/no-extraneous-class -- 仅为 instanceof HTMLElement 占位,任何对象 instanceof 都为 false
class HTMLElementStub {}
Object.defineProperty(globalThis, "HTMLElement", { value: HTMLElementStub, writable: true, configurable: true });

export function __resetNuxtState(): void { stateMap.clear(); }
export function __resetLocalStorage(): void { _storage.clear(); }