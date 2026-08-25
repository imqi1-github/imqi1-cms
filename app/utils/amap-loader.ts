import { buildAmapDirectScriptUrl, buildAmapProxyScriptUrl, buildAmapServiceHost } from "#shared/amap-proxy";
import { useRuntimeConfig } from "#imports";
import type { AmapClientConfig, LoadAmapOptions, AmapWindow } from "~/types/utils/amap";

// 高德 script 加载回调的全局 key。代理/直连两种模式共用同一回调名（见 buildAmapProxyScriptUrl /
// buildAmapDirectScriptUrl），避免命名误导引发「直连模式不该出现此残留」之类的误删重构。
const AMAP_SCRIPT_CALLBACK = "__amapScriptLoaded" as const;

let amapLoadPromise: Promise<typeof AMap> | null = null;
let loadedVersion: string | null = null;
let loadedMode: "proxy" | "direct" | null = null;
const loadedPlugins = new Set<string>();

function normalizePlugins(plugins: string[] = []) {
  return [...new Set(plugins.filter(Boolean))];
}

function resetLoaderState() {
  amapLoadPromise = null;
  loadedVersion = null;
  loadedMode = null;
  loadedPlugins.clear();
}

function getBrowserWindow(): AmapWindow {
  if (typeof window === "undefined" || typeof document === "undefined") {
    throw new Error("AMap can only be loaded in the browser.");
  }

  return window as AmapWindow;
}

async function loadMissingPlugins(_AMap: typeof AMap, plugins: string[]) {
  const missingPlugins = plugins.filter(plugin => !loadedPlugins.has(plugin));
  if (!missingPlugins.length) return _AMap;

  if (typeof _AMap?.plugin !== "function") {
    throw new Error("AMap.plugin is not available.");
  }

  await new Promise<void>(resolve => {
    _AMap.plugin(missingPlugins, () => {
      missingPlugins.forEach(plugin => loadedPlugins.add(plugin));
      resolve();
    });
  });

  return _AMap;
}

// 运行时解析高德客户端配置：key/securityCode 不烘焙进包，直连模式从 /api/amap/config 获取
//（服务端读 process.env）；代理模式浏览器不持 key，返回空串。
export async function resolveAmapClientConfig(): Promise<AmapClientConfig> {
  const config = useRuntimeConfig();
  const useProxy = Boolean(config.public.amapUseServerProxy);
  if (useProxy) {
    return { useProxy, key: "", securityJsCode: "" };
  }
  const res = await $fetch<{ key?: string; securityCode?: string }>("/api/amap/config");
  return {
    useProxy,
    key: res.key || "",
    securityJsCode: res.securityCode || "",
  };
}

export async function loadAmap(options: LoadAmapOptions = {}): Promise<typeof AMap> {
  const version = options.version || "2.0";
  const plugins = normalizePlugins(options.plugins);
  const useProxy = options.useProxy !== false;
  const browserWindow = getBrowserWindow();

  if (loadedVersion && loadedVersion !== version) {
    throw new Error(`AMap ${loadedVersion} is already loaded. Cannot mix version ${version}.`);
  }

  if (loadedMode && loadedMode !== (useProxy ? "proxy" : "direct")) {
    throw new Error(`AMap is already loaded in ${loadedMode} mode.`);
  }

  if (!useProxy && (!options.key || !options.securityJsCode)) {
    throw new Error("AMap key and securityJsCode are required when proxy mode is disabled.");
  }

  if (browserWindow.AMap) {
    loadedVersion = loadedVersion || version;
    loadedMode = loadedMode || (useProxy ? "proxy" : "direct");
    return loadMissingPlugins(browserWindow.AMap, plugins);
  }

  if (!amapLoadPromise) {
    loadedVersion = version;
    loadedMode = useProxy ? "proxy" : "direct";
    browserWindow._AMapSecurityConfig = useProxy
      ? { serviceHost: buildAmapServiceHost(browserWindow.location.origin) }
      : { securityJsCode: options.securityJsCode };

    amapLoadPromise = new Promise((resolve, reject) => {
      const parentNode = document.body || document.head;
      if (!parentNode) {
        resetLoaderState();
        reject(new Error("Unable to find a DOM node to append the AMap script."));
        return;
      }

      (browserWindow as unknown as Record<string, unknown>)[AMAP_SCRIPT_CALLBACK] = (error?: unknown) => {
        clearTimeout(timeout);
        // 删除动态计算的 key；用 Reflect.deleteProperty 避免 @typescript-eslint/no-dynamic-delete 报错。
        Reflect.deleteProperty(browserWindow, AMAP_SCRIPT_CALLBACK);

        if (error) {
          // 回调携带 error 时同样移除已 append 的 script 节点，避免重试累积 DOM（与 script.onerror 对齐）
          script.parentNode?.removeChild(script);
          resetLoaderState();
          reject(error instanceof Error ? error : new Error(String(error)));
          return;
        }

        plugins.forEach(plugin => loadedPlugins.add(plugin));
        resolve(browserWindow.AMap);
      };

      const script = document.createElement("script");
      // 动态 append 的 script，defer 与 async 行为等价，留 async 即可。
      script.async = true;
      script.src = useProxy
        ? buildAmapProxyScriptUrl({
            version,
            plugins,
            callback: AMAP_SCRIPT_CALLBACK,
          })
        : buildAmapDirectScriptUrl({
            version,
            plugins,
            callback: AMAP_SCRIPT_CALLBACK,
            key: options.key!,
          });
      script.onerror = () => {
        // 失败时移除已 append 的 script 节点，避免 DOM 残留；script.onerror 不会重复触发，
        // 但节点仍可能继续尝试解析、留下无意义资源。
        clearTimeout(timeout);
        script.parentNode?.removeChild(script);
        Reflect.deleteProperty(browserWindow, AMAP_SCRIPT_CALLBACK);
        resetLoaderState();
        reject(new Error(
          useProxy
            ? "Failed to load the proxied AMap script."
            : "Failed to load the AMap script.",
        ));
      };

      parentNode.appendChild(script);

      // 超时兜底：脚本加载/全局回调永不触发时不能永久 pending（会毒化 amapLoadPromise 单例 + 下游 await 无限等）。
      // 复用 script.onerror 的清理，避免残留 <script> 节点与回调名。
      const timeout = setTimeout(() => {
        script.parentNode?.removeChild(script);
        Reflect.deleteProperty(browserWindow, AMAP_SCRIPT_CALLBACK);
        resetLoaderState();
        reject(new Error("Failed to load the AMap script: timed out."));
      }, 12000);
    });
  }

  const AMap = await amapLoadPromise;
  return loadMissingPlugins(AMap, plugins);
}
