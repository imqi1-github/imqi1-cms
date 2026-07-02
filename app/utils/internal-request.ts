import { useRuntimeConfig } from "#imports";

export function getInternalRequestHeaders(): Record<string, string> {
  if (!import.meta.server) {
    return {};
  }

  const config = useRuntimeConfig();
  const secret = config.ssrInternalRequestSecret;

  return {
    "x-ssr-internal-request": secret || "true",
  };
}
