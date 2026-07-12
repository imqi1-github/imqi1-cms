import { buildAmapDirectScriptUrl, buildAmapProxyScriptUrl, buildAmapServiceHost } from "#shared/amap-proxy";
import type { LoadAmapOptions, AmapWindow } from "~/types/utils/amap";

const AMAP_SCRIPT_CALLBACK = "__onAmapProxyLoaded" as const;

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

      browserWindow[AMAP_SCRIPT_CALLBACK] = (error?: unknown) => {
        delete browserWindow.__onAmapProxyLoaded;

        if (error) {
          resetLoaderState();
          reject(error instanceof Error ? error : new Error(String(error)));
          return;
        }

        plugins.forEach(plugin => loadedPlugins.add(plugin));
        resolve(browserWindow.AMap);
      };

      const script = document.createElement("script");
      script.async = true;
      script.defer = true;
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
        delete browserWindow.__onAmapProxyLoaded;
        resetLoaderState();
        reject(new Error("Failed to load the proxied AMap script."));
      };

      parentNode.appendChild(script);
    });
  }

  const AMap = await amapLoadPromise;
  return loadMissingPlugins(AMap, plugins);
}
