import { setResponseHeader } from "h3";

// 高德地图客户端配置下发接口（直连模式专用）。
// 代理模式下 key/securityCode 只存在于服务端（由 /_AMapService 注入），浏览器不持 key，这里返回空。
// 直连模式（开发环境）浏览器需要 key 才能加载高德 JS，运行时从这里拿（服务端读 process.env，不烘焙进包）。
export default defineEventHandler(event => {
  // 直连模式下浏览器才持 securityCode——它是对外下发的敏感密钥，
  // 禁止代理/CDN 缓存，避免把该密钥落到任何共享缓存层（对齐 verify/captcha 的 no-store 约定）。
  setResponseHeader(event, "Cache-Control", "no-store, no-cache, must-revalidate");

  const useProxy = useRuntimeConfig().public.amapUseServerProxy;
  if (useProxy) {
    return { key: "", securityCode: "" };
  }
  return {
    key: process.env.AMAP_KEY || "",
    securityCode: process.env.AMAP_SECURITY_CODE || "",
  };
});
