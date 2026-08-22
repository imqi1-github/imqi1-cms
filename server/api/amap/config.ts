// 高德地图客户端配置下发接口（直连模式专用）。
// 代理模式下 key/securityCode 只存在于服务端（由 /_AMapService 注入），浏览器不持 key，这里返回空。
// 直连模式（开发环境）浏览器需要 key 才能加载高德 JS，运行时从这里拿（服务端读 process.env，不烘焙进包）。
export default defineEventHandler(() => {
  const useProxy = useRuntimeConfig().public.amapUseServerProxy;
  if (useProxy) {
    return { key: "", securityCode: "" };
  }
  return {
    key: process.env.AMAP_KEY || "",
    securityCode: process.env.AMAP_SECURITY_CODE || "",
  };
});
